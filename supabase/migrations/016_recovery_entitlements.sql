-- 016: recovery entitlements (2.6). Per-allocation immutable entitlement rate;
-- deals carry a pricing policy so v1 clearing math is never repriced.
alter table allocations add column if not exists entitlement_rate numeric;
alter table allocations add column if not exists entitlement_minor int;
alter table deals add column if not exists pricing_policy text not null default 'v1-clearing'
  check (pricing_policy in ('v1-clearing', 'v2-entitlement'));

-- backfill settled history at clearing (preserves the 15,000/22,500/37,500 fixture)
update allocations a set
  entitlement_rate = d.clearing_per_kg,
  entitlement_minor = round(
    (case when a.inspection_status = 'passed' then a.allocated_kg
          when a.inspection_status = 'partial' then least(coalesce(a.usable_kg, 0), a.allocated_kg)
          else 0 end) * d.clearing_per_kg * 100)
from deals d where d.id = a.deal_id and a.entitlement_rate is null;

-- stamp immutable entitlement at inspection time (committed min rate × usable kg)
create or replace function record_lot_inspection(p_allocation uuid,p_input jsonb,p_decision jsonb,p_op_key text)
returns jsonb language plpgsql as $$
declare a allocations; d deals; prior inspections; accepted numeric; target numeric; rate numeric;
begin
 select * into a from allocations where id=p_allocation;
 select * into d from deals where id=a.deal_id for update;
 select * into a from allocations where id=p_allocation for update;
 if a.id is null then raise exception 'allocation not found'; end if;
 select * into prior from inspections where op_key=p_op_key;
 if found then
   if prior.allocation_id<>a.id or prior.weight_received_kg<>(p_input->>'weight_received_kg')::numeric
    or prior.moisture_pct<>(p_input->>'moisture_pct')::numeric or prior.visual_score<>(p_input->>'visual_score')::numeric
    or prior.condition<>p_input->>'condition' then raise exception 'idempotency key reused with different inspection'; end if;
   return jsonb_build_object('decision',prior.decision,'grade',prior.grade,'usable_kg',prior.usable_kg,'replayed',true);
 end if;
 if a.inspection_status<>'pending' or d.status not in ('procuring','covered','short') or d.outcome<>'pending' then raise exception 'inspection locked'; end if;
 if (p_decision->>'usable_kg')::numeric>least(a.allocated_kg,(p_input->>'weight_received_kg')::numeric) or (p_decision->>'usable_kg')::numeric<0 then raise exception 'usable quantity out of bounds'; end if;
 rate := case when d.pricing_policy='v1-clearing' then d.clearing_per_kg
              else coalesce(a.entitlement_rate,case when a.allocated_kg>0 then a.cost/a.allocated_kg else 0 end) end;
 insert into inspections(allocation_id,attempt,weight_received_kg,usable_kg,moisture_pct,visual_score,condition,decision,grade,op_key)
 values(a.id,a.attempt,(p_input->>'weight_received_kg')::numeric,(p_decision->>'usable_kg')::numeric,(p_input->>'moisture_pct')::numeric,(p_input->>'visual_score')::numeric,p_input->>'condition',p_decision->>'decision',p_decision->>'grade',p_op_key);
 update allocations set inspection_status=p_decision->>'decision',quality_grade=p_decision->>'grade',usable_kg=(p_decision->>'usable_kg')::numeric,
 weight_received_kg=(p_input->>'weight_received_kg')::numeric,moisture_pct=(p_input->>'moisture_pct')::numeric,visual_score=(p_input->>'visual_score')::numeric,condition=p_input->>'condition',
 entitlement_rate=rate, entitlement_minor=round(least(a.allocated_kg,(p_decision->>'usable_kg')::numeric)*rate*100) where id=a.id;
 if p_decision->>'decision'='failed' then update suppliers set quarantined=true where id=a.supplier_id; end if;
 select coalesce(sum(case when inspection_status in ('passed','partial') then greatest(0,least(allocated_kg,coalesce(usable_kg,0),coalesce(weight_received_kg,0))) else 0 end),0) into accepted from allocations where deal_id=d.id;
 select quantity_kg into target from buyer_requests where id=d.request_id;
 if accepted>=target and not exists(select 1 from allocations where deal_id=d.id and inspection_status='pending') then
   update shortage_incidents set status='resolved' where deal_id=d.id and status in ('open','recovering');
 end if;
 if accepted<target and not exists(select 1 from allocations where deal_id=d.id and inspection_status='pending') then
   insert into commerce_jobs(op_key,scope,kind,payload,deadline)
   values('recovery:'||d.id||':'||a.attempt,d.id::text,'recovery_advance',jsonb_build_object('dealId',d.id),now()+interval '24 hours') on conflict(op_key) do nothing;
 end if;
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,'lot_inspected',p_decision,p_op_key||':event');
 return p_decision;
end $$;
