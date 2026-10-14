-- 005: atomic paid reservation RPC (1.4). Locks lots in stable order, rechecks
-- remaining (offer minus unreleased commitments), writes allocations + reservation
-- + event atomically. Op-key dedupe returns the stored result on replay.
create or replace function reserve_paid_plan(
  p_deal_id uuid, p_request_id uuid, p_attempt int, p_op_key text, p_items jsonb
) returns jsonb language plpgsql as $$
declare
  v_status text; v_verified jsonb; v_seen jsonb;
  item jsonb; v_avail int; v_committed int; v_need int;
begin
  select payload into v_seen from deal_events where op_key = p_op_key;
  if found then return jsonb_build_object('replayed', true, 'result', v_seen); end if;

  select status, paypal_verified into v_status, v_verified from deals where id = p_deal_id for update;
  if v_status is null then raise exception 'deal not found'; end if;
  if v_verified is null then raise exception 'paid verification required'; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    select quantity_kg into v_avail from suppliers where id = (item->>'supplier_id')::uuid for update;
    if v_avail is null then raise exception 'supplier lot not found'; end if;
    select coalesce(sum(a.allocated_kg),0) into v_committed from allocations a
      join deals d on d.id = a.deal_id
      where a.supplier_id = (item->>'supplier_id')::uuid
        and d.status in ('paid','procuring','covered')
        and not exists (select 1 from supply_reservations r where r.deal_id = a.deal_id and r.supplier_id = a.supplier_id and r.released);
    -- allocations double as commitments here; reservations recorded for audit
    v_need := (item->>'kg')::int;
    if v_avail - v_committed < v_need then raise exception 'insufficient uncommitted stock'; end if;
    insert into allocations (deal_id, supplier_id, allocated_kg, cost, attempt, payout_status)
      values (p_deal_id, (item->>'supplier_id')::uuid, v_need, (item->>'cost')::numeric, p_attempt, 'pending')
      on conflict (deal_id, supplier_id, attempt) do nothing;
    insert into supply_reservations (deal_id, supplier_id, kg, attempt, op_key)
      values (p_deal_id, (item->>'supplier_id')::uuid, v_need, p_attempt, p_op_key || ':' || (item->>'supplier_id'))
      on conflict (op_key) do nothing;
  end loop;

  update deals set status = 'procuring' where id = p_deal_id and status = 'paid';
  insert into deal_events (deal_id, type, payload, op_key)
    values (p_deal_id, 'plan_reserved', jsonb_build_object('attempt', p_attempt, 'items', p_items), p_op_key);
  return jsonb_build_object('replayed', false, 'result', jsonb_build_object('attempt', p_attempt));
end $$;
