-- 012: executable decisions (2.2). Snapshots, content-hashed plans, decision records,
-- command receipts, optimistic deal versions. v1 history untouched; v2 orders bind decisions.
create table if not exists planning_snapshots (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id),
  spec_hash text not null, snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists procurement_plans (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references planning_snapshots(id),
  strategy text not null, items jsonb not null, cost_total numeric not null,
  plan_hash text unique not null, created_at timestamptz not null default now()
);
create table if not exists decision_records (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id),
  request_id uuid not null references buyer_requests(id),
  spec_version int not null default 1, policy_version text not null default 'v1',
  model text, prompt_version text not null default 'p1',
  candidate_hash text not null, plan_hash text not null,
  plan_id uuid references procurement_plans(id),
  evidence jsonb not null default '{}', expires_at timestamptz not null,
  status text not null default 'valid' check (status in ('valid','expired','superseded')),
  created_at timestamptz not null default now()
);
create table if not exists command_receipts (
  command_id text primary key,
  deal_id uuid not null references deals(id),
  expected_version int not null, quote_id uuid references quote_revisions(id),
  decision_id uuid references decision_records(id),
  plan_hash text not null, result jsonb not null,
  created_at timestamptz not null default now()
);
alter table deals add column if not exists version int not null default 1;
create index if not exists decisions_request_idx on decision_records (request_id, created_at);
alter table planning_snapshots enable row level security;
alter table procurement_plans enable row level security;
alter table decision_records enable row level security;
alter table command_receipts enable row level security;

-- Bound execution: one transaction validates version/capture/binding/fresh stock,
-- then writes allocations + reservations + receipt + event and bumps the version.
create or replace function execute_bound_plan(
  p_command_id text, p_deal_id uuid, p_expected_version int, p_quote_id uuid,
  p_decision_id uuid, p_attempt int, p_op_key text
) returns jsonb language plpgsql as $$
declare
  v_deal record; v_req record; v_quote record; v_dec record;
  v_items jsonb; v_sum_kg int := 0; v_sum_cost numeric := 0;
  item jsonb; v_avail int; v_committed int;
begin
  select * into v_deal from deals where id = p_deal_id for update;
  if v_deal is null then raise exception 'deal not found'; end if;
  if v_deal.version is distinct from p_expected_version then raise exception 'stale deal version'; end if;
  if v_deal.paypal_verified is null then raise exception 'paid verification required'; end if;

  select * into v_dec from decision_records where id = p_decision_id;
  if v_dec is null or v_dec.status <> 'valid' then raise exception 'decision invalid'; end if;
  if v_dec.expires_at < now() then raise exception 'decision expired'; end if;

  select * into v_quote from quote_revisions where id = p_quote_id;
  if v_quote is null or v_quote.status <> 'accepted' then raise exception 'quote not accepted'; end if;

  -- trusted items load on the server/database; the command carries IDs only
  select items into v_items from procurement_plans where id = v_dec.plan_id;
  if v_items is null then raise exception 'stored plan not found'; end if;

  select * into v_req from buyer_requests where id = v_deal.request_id;
  v_hash := encode(digest(canonical_json(p_items), 'sha256'), 'hex');

  for item in select * from jsonb_array_elements(v_items) loop
    v_sum_kg := v_sum_kg + (item->>'kg')::int;
    v_sum_cost := v_sum_cost + (item->>'kg')::int * (item->>'rate')::numeric;
    if (item->>'rate')::numeric > v_quote.per_kg then raise exception 'supplier rate exceeds quoted unit price'; end if;
    select quantity_kg into v_avail from suppliers where id = (item->>'supplier_id')::uuid for update;
    if v_avail is null then raise exception 'supplier lot not found'; end if;
    select coalesce(sum(a.allocated_kg),0) into v_committed from allocations a
      join deals d on d.id = a.deal_id
      where a.supplier_id = (item->>'supplier_id')::uuid
        and d.status in ('paid','procuring','covered')
        and not exists (select 1 from supply_reservations r where r.deal_id = a.deal_id and r.supplier_id = a.supplier_id and r.released);
    if v_avail - v_committed < (item->>'kg')::int then raise exception 'insufficient uncommitted stock'; end if;
    insert into allocations (deal_id, supplier_id, allocated_kg, cost, attempt, payout_status)
      values (p_deal_id, (item->>'supplier_id')::uuid, (item->>'kg')::int, round((item->>'kg')::int * (item->>'rate')::numeric), p_attempt, 'pending')
      on conflict (deal_id, supplier_id, attempt) do nothing;
    insert into supply_reservations (deal_id, supplier_id, kg, attempt, op_key)
      values (p_deal_id, (item->>'supplier_id')::uuid, (item->>'kg')::int, p_attempt, p_op_key || ':' || (item->>'supplier_id'))
      on conflict (op_key) do nothing;
  end loop;
  if v_sum_kg <> v_req.quantity_kg then raise exception 'plan covers % of % kg', v_sum_kg, v_req.quantity_kg; end if;
  if v_sum_cost > v_deal.supplier_cost then raise exception 'plan cost exceeds quoted supplier pool'; end if;

  insert into command_receipts (command_id, deal_id, expected_version, quote_id, decision_id, plan_hash, result)
    values (p_command_id, p_deal_id, p_expected_version, p_quote_id, p_decision_id, v_dec.plan_hash,
            jsonb_build_object('kg', v_sum_kg, 'cost', v_sum_cost, 'attempt', p_attempt))
    on conflict (command_id) do nothing;

  update deals set status = 'procuring', version = version + 1 where id = p_deal_id and version = p_expected_version;
  update buyer_requests set status = 'procuring' where id = v_deal.request_id and status in ('paid','procuring');
  insert into deal_events (deal_id, type, payload, op_key)
    values (p_deal_id, 'plan_executed', jsonb_build_object('command', p_command_id, 'plan_hash', v_dec.plan_hash, 'decision', p_decision_id), p_op_key);
  return jsonb_build_object('command', p_command_id, 'plan_hash', v_dec.plan_hash, 'kg', v_sum_kg, 'cost', v_sum_cost);
end $$;
