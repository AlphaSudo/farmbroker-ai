-- Corrective migration: contracts, payment claims, inspection truth, isolated demos.
begin;
alter table deals add column if not exists created_at timestamptz not null default now();
create table if not exists demo_fixtures (
  id uuid primary key default gen_random_uuid(), scenario text not null,
  created_at timestamptz not null default now()
);
alter table demo_fixtures enable row level security;
alter table suppliers add column if not exists fixture_id uuid references demo_fixtures(id);
alter table suppliers add column if not exists backup_only boolean not null default false;
alter table suppliers add column if not exists quarantined boolean not null default false;
alter table buyer_requests add column if not exists fixture_id uuid references demo_fixtures(id);

alter table payment_attempts drop constraint if exists payment_attempts_status_check;
alter table payment_attempts add constraint payment_attempts_status_check check
  (status in ('creating','created','approved','capture_pending','captured','failed','expired','superseded'));
alter table payment_attempts add column if not exists lease_until timestamptz;
alter table payment_attempts add column if not exists capture_key uuid not null default gen_random_uuid();
-- Preserve provider IDs/history. Only supersede duplicate unclaimed local attempts.
do $$ begin
  if exists (select 1 from payment_attempts where status='captured' group by deal_id having count(*)>1) then
    raise exception 'Multiple captures require manual reconciliation before migration';
  end if;
end $$;
with ranked as (
 select id, row_number() over (partition by deal_id order by
 case status when 'captured' then 0 when 'approved' then 1 else 2 end, created_at, id) as n
 from payment_attempts where status in ('creating','created','approved','capture_pending','captured')
)
update payment_attempts set status='superseded' where id in (select id from ranked where n>1);
create unique index if not exists payment_one_active_contract on payment_attempts(deal_id)
 where status in ('creating','created','approved','capture_pending','captured');
create unique index if not exists refund_one_capture on refunds(capture_id)
 where status in ('requested','pending','completed','needs_review');

create or replace function accept_quote_contract(p_revision uuid, p_request uuid)
returns jsonb language plpgsql as $$
declare r buyer_requests; q quote_revisions; d deals; floor_price numeric;
begin
 select * into r from buyer_requests where id=p_request for update;
 if not found then raise exception 'request not found'; end if;
 select * into q from quote_revisions where id=p_revision and request_id=r.id for update;
 if not found then raise exception 'revision not found'; end if;
 select * into d from deals where request_id=r.id for update;
 if d.id is not null and d.accepted_quote_id=q.id and q.status='accepted' then return to_jsonb(d); end if;
 if r.status not in ('open','quoted') or (d.id is not null and d.status<>'quoted') then raise exception 'terms locked after payment'; end if;
 if d.id is not null and exists (select 1 from payment_attempts where deal_id=d.id and status in ('creating','created','approved','capture_pending','captured')) then
   raise exception 'terms locked by active checkout';
 end if;
 if q.status<>'draft' or q.expires_at<=now() then raise exception 'quote expired or no longer draft'; end if;
 floor_price := (q.snapshot->>'clearing')::numeric;
 if floor_price is null or floor_price<=0 or q.per_kg<floor_price or q.per_kg>r.max_price
    or q.total_minor<>round(q.per_kg*r.quantity_kg*100) then raise exception 'quote economics invalid'; end if;
 update quote_revisions set status='superseded' where request_id=r.id and status in ('draft','accepted') and id<>q.id;
 update quote_revisions set status='accepted',accepted_at=now() where id=q.id;
 if d.id is null then
   insert into deals(request_id,total_price,supplier_cost,margin,per_kg,clearing_per_kg,status,accepted_quote_id)
   values(r.id,q.total_minor/100.0,round(floor_price*r.quantity_kg),q.total_minor/100.0-round(floor_price*r.quantity_kg),q.per_kg,floor_price,'quoted',q.id) returning * into d;
 else
   update deals set total_price=q.total_minor/100.0,supplier_cost=round(floor_price*r.quantity_kg),
     margin=q.total_minor/100.0-round(floor_price*r.quantity_kg),per_kg=q.per_kg,clearing_per_kg=floor_price,accepted_quote_id=q.id
     where id=d.id returning * into d;
 end if;
 update buyer_requests set status='quoted',accepted_quote_id=q.id where id=r.id;
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,'quote_revision_accepted',jsonb_build_object('revision',q.id),'accept:'||q.id) on conflict(op_key) do nothing;
 return to_jsonb(d);
end $$;

create or replace function claim_payment_attempt(p_deal uuid)
returns jsonb language plpgsql as $$
declare d deals; q quote_revisions; a payment_attempts; r buyer_requests;
begin
 select * into d from deals where id=p_deal for update;
 if not found or d.status<>'quoted' then raise exception 'deal not payable'; end if;
 select * into r from buyer_requests where id=d.request_id;
 select * into q from quote_revisions where id=d.accepted_quote_id;
 if q.id is null or q.status<>'accepted' or q.total_minor<>round(d.total_price*100)
 or q.per_kg<>d.per_kg or d.per_kg<d.clearing_per_kg or d.per_kg>r.max_price then raise exception 'accepted quote economics invalid'; end if;
 select * into a from payment_attempts where deal_id=d.id and status in ('creating','created','approved','capture_pending','captured') for update;
 if found then
   if a.status='creating' and (a.lease_until is null or a.lease_until<now()) then
     if a.created_at<now()-interval '30 minutes' then raise exception 'payment creation uncertain; Hub review required'; end if;
     update payment_attempts set lease_until=now()+interval '30 seconds' where id=a.id returning * into a;
     return jsonb_build_object('claimed',true,'attempt',to_jsonb(a));
   end if;
   return jsonb_build_object('claimed',false,'attempt',to_jsonb(a));
 end if;
 if q.expires_at<=now() then raise exception 'accepted quote expired'; end if;
 insert into payment_attempts(deal_id,quote_revision_id,usd_minor,status,op_key,lease_until)
 values(d.id,q.id,q.usd_minor,'creating',gen_random_uuid()::text,now()+interval '30 seconds') returning * into a;
 return jsonb_build_object('claimed',true,'attempt',to_jsonb(a));
end $$;

create or replace function record_verified_capture(p_attempt uuid,p_proof jsonb)
returns jsonb language plpgsql as $$
declare a payment_attempts; d deals;
begin
 select * into a from payment_attempts where id=p_attempt;
 select * into d from deals where id=a.deal_id for update;
 select * into a from payment_attempts where id=p_attempt for update;
 if a.status='captured' and d.paypal_capture_id=p_proof->>'captureId' then return jsonb_build_object('replayed',true); end if;
 if a.status not in ('created','approved','capture_pending') or d.status<>'quoted' then raise exception 'capture state invalid'; end if;
 if p_proof->>'status'<>'COMPLETED' or p_proof->>'currency'<>'USD' or coalesce(p_proof->>'captureId','')=''
 or coalesce(p_proof->>'payee','')='' or coalesce(p_proof->>'orderId','')<>a.provider_order_id
 or (p_proof->>'amount')::numeric*100<>a.usd_minor then raise exception 'capture proof invalid'; end if;
 update payment_attempts set status='captured' where id=a.id;
 update deals set status='paid',paypal_order_id=a.provider_order_id,paypal_capture_id=p_proof->>'captureId',paypal_verified=p_proof where id=d.id;
 update buyer_requests set status='paid' where id=d.request_id;
 insert into ledger_entries(deal_id,kind,usd_minor,note) values(d.id,'capture_receipt',a.usd_minor,'Sandbox capture '||(p_proof->>'captureId'));
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,'payment_verified',p_proof,'capture:'||a.id) on conflict(op_key) do nothing;
 return jsonb_build_object('replayed',false);
end $$;

create or replace function reserve_paid_plan(p_deal_id uuid,p_request_id uuid,p_attempt int,p_op_key text,p_items jsonb)
returns jsonb language plpgsql as $$
declare d deals; r buyer_requests; s suppliers; item jsonb; free_kg numeric; need numeric; accepted numeric; planned numeric; row_count int;
begin
 select * into d from deals where id=p_deal_id for update;
 if d.id is null then raise exception 'deal not found'; end if;
 if d.paypal_verified is null or d.paypal_capture_id is null then raise exception 'paid verification required'; end if;
 if d.request_id<>p_request_id then raise exception 'request binding mismatch'; end if;
 if exists(select 1 from deal_events where op_key=p_op_key and deal_id=d.id) then return jsonb_build_object('replayed',true); end if;
 if d.status not in ('paid','procuring','covered','short') or d.outcome<>'pending' then raise exception 'deal no longer procurable'; end if;
 if exists(select 1 from refunds where deal_id=d.id and status in ('requested','pending','completed','needs_review')) then raise exception 'refund in progress'; end if;
 select * into r from buyer_requests where id=d.request_id;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or p_attempt<1 or p_attempt>3 then raise exception 'invalid plan'; end if;
 select count(distinct x->>'supplier_id'),sum((x->>'kg')::numeric) into row_count,planned from jsonb_array_elements(p_items) x;
 if row_count<>jsonb_array_length(p_items) then raise exception 'duplicate supplier lot'; end if;
 select coalesce(sum(case when inspection_status in ('passed','partial') then greatest(0,least(allocated_kg,coalesce(usable_kg,0),coalesce(weight_received_kg,0))) else 0 end),0) into accepted from allocations where deal_id=d.id;
 if p_attempt=1 and (planned<>r.quantity_kg or exists(select 1 from allocations where deal_id=d.id)) then raise exception 'initial plan must cover target once'; end if;
 if p_attempt>1 and (planned<>r.quantity_kg-accepted or exists(select 1 from allocations where deal_id=d.id and inspection_status='pending')) then raise exception 'inspect all lots before recovery'; end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'supplier_id' loop
   select * into s from suppliers where id=(item->>'supplier_id')::uuid for update;
   if s.id is null or s.quarantined or s.fixture_id is distinct from r.fixture_id or s.pool<>r.pool or lower(s.crop)<>lower(r.crop)
    or (s.available_date is not null and s.available_date>r.created_at::date+r.delivery_days)
    or (p_attempt=1 and s.backup_only) then raise exception 'ineligible supplier lot'; end if;
   need := (item->>'kg')::numeric;
   if need<=0 or need<>trunc(need) or (item->>'cost')::numeric<round(need*s.min_price)
    or s.min_price>d.clearing_per_kg then raise exception 'invalid quantity or below-floor economics'; end if;
   select s.quantity_kg-coalesce(sum(kg),0) into free_kg from supply_reservations where supplier_id=s.id and not released;
   if free_kg<need then raise exception 'insufficient uncommitted stock'; end if;
   insert into allocations(deal_id,supplier_id,allocated_kg,cost,attempt,payout_status) values(d.id,s.id,need,(item->>'cost')::numeric,p_attempt,'pending');
   insert into supply_reservations(deal_id,supplier_id,kg,attempt,op_key) values(d.id,s.id,need,p_attempt,p_op_key||':'||s.id);
 end loop;
 update deals set status='procuring' where id=d.id;
 update buyer_requests set status='procuring' where id=r.id;
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,'plan_reserved',jsonb_build_object('attempt',p_attempt,'items',p_items),p_op_key);
 return jsonb_build_object('replayed',false);
end $$;

create or replace function record_lot_inspection(p_allocation uuid,p_input jsonb,p_decision jsonb,p_op_key text)
returns jsonb language plpgsql as $$
declare a allocations; d deals; prior inspections; accepted numeric; target numeric;
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
 insert into inspections(allocation_id,attempt,weight_received_kg,usable_kg,moisture_pct,visual_score,condition,decision,grade,op_key)
 values(a.id,a.attempt,(p_input->>'weight_received_kg')::numeric,(p_decision->>'usable_kg')::numeric,(p_input->>'moisture_pct')::numeric,(p_input->>'visual_score')::numeric,p_input->>'condition',p_decision->>'decision',p_decision->>'grade',p_op_key);
 update allocations set inspection_status=p_decision->>'decision',quality_grade=p_decision->>'grade',usable_kg=(p_decision->>'usable_kg')::numeric,
 weight_received_kg=(p_input->>'weight_received_kg')::numeric,moisture_pct=(p_input->>'moisture_pct')::numeric,visual_score=(p_input->>'visual_score')::numeric,condition=p_input->>'condition' where id=a.id;
 if p_decision->>'decision'='failed' then update suppliers set quarantined=true where id=a.supplier_id; end if;
 select coalesce(sum(case when inspection_status in ('passed','partial') then greatest(0,least(allocated_kg,coalesce(usable_kg,0),coalesce(weight_received_kg,0))) else 0 end),0) into accepted from allocations where deal_id=d.id;
 select quantity_kg into target from buyer_requests where id=d.request_id;
 if accepted>=target and not exists(select 1 from allocations where deal_id=d.id and inspection_status='pending') then
   update shortage_incidents set status='resolved' where deal_id=d.id and status in ('open','recovering');
 end if;
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,'lot_inspected',p_decision,p_op_key||':event');
 return p_decision;
end $$;

create or replace function complete_deal_phase(p_deal uuid,p_phase text)
returns jsonb language plpgsql as $$
declare d deals; target numeric; accepted numeric;
begin
 select * into d from deals where id=p_deal for update;
 if d.id is null then raise exception 'deal not found'; end if;
 if p_phase='settle' and d.status='settled' then return jsonb_build_object('replayed',true); end if;
 if p_phase='handover' and d.outcome='fulfilled' then return jsonb_build_object('replayed',true); end if;
 if d.paypal_verified is null or d.outcome<>'pending' or exists(select 1 from refunds where deal_id=d.id and status in ('requested','pending','needs_review','completed')) then raise exception 'deal cannot complete'; end if;
 if exists(select 1 from allocations where deal_id=d.id and inspection_status='pending') then raise exception 'complete inspection first'; end if;
 select quantity_kg into target from buyer_requests where id=d.request_id;
 select coalesce(sum(case when inspection_status in ('passed','partial') then greatest(0,least(allocated_kg,coalesce(usable_kg,0),coalesce(weight_received_kg,0))) else 0 end),0) into accepted from allocations where deal_id=d.id;
 if accepted<>target then raise exception 'unresolved shortage or excess accepted quantity'; end if;
 if exists(select 1 from shortage_incidents where deal_id=d.id and status in ('open','recovering','refund_eligible')) then raise exception 'unresolved shortage incident'; end if;
 if p_phase='settle' and d.status in ('procuring','covered','short') then
   update allocations set payout_status='calculated' where deal_id=d.id;
   update deals set status='settled' where id=d.id;
   update buyer_requests set status='settled' where id=d.request_id;
 elsif p_phase='handover' and d.status='settled' then
   update deals set outcome='fulfilled',completed_at=now(),handover_at=now() where id=d.id;
   update buyer_requests set status='completed' where id=d.request_id;
 else raise exception 'invalid completion phase'; end if;
 insert into deal_events(deal_id,type,payload,op_key) values(d.id,case when p_phase='settle' then 'settlement_calculated' else 'handover_simulated' end,
 jsonb_build_object('accepted_kg',accepted,'simulated',true),p_phase||':'||d.id) on conflict(op_key) do nothing;
 return jsonb_build_object('replayed',false);
end $$;

create or replace function create_demo_fixture(p_scenario text,p_owner uuid)
returns uuid language plpgsql as $$
declare fixture uuid; request_id uuid;
begin
 if p_scenario not in ('happy-path','recovery','refund') then raise exception 'unknown scenario'; end if;
 insert into demo_fixtures(scenario) values(p_scenario) returning id into fixture;
 insert into suppliers(name,crop,quantity_kg,min_price,available_date,location,quality_score,pool,fixture_id,backup_only) values
 ('Ahmed '||fixture,'Mint',2000,7.0,current_date+3,'Menoufia',92,'demo',fixture,false),
 ('Mohamed '||fixture,'Mint',3000,7.5,current_date+3,'Menoufia',88,'demo',fixture,false),
 ('Ali '||fixture,'Mint',5000,7.3,current_date+3,'Giza',90,'demo',fixture,false);
 if p_scenario='recovery' then
   insert into suppliers(name,crop,quantity_kg,min_price,available_date,location,quality_score,pool,fixture_id,backup_only)
   values('Standby '||fixture,'Mint',2000,7.4,current_date+3,'Giza',91,'demo',fixture,true);
 end if;
 insert into buyer_requests(buyer_name,crop,quantity_kg,delivery_days,max_price,status,pool,scenario,owner_token,fixture_id)
 values('E2E '||p_scenario,'Mint',10000,7,9,'open','demo',p_scenario,p_owner,fixture) returning id into request_id;
 return request_id;
end $$;

-- Keep service-only capabilities behind authenticated server handlers.
revoke all on function accept_quote_contract(uuid,uuid),claim_payment_attempt(uuid),record_verified_capture(uuid,jsonb),
 reserve_paid_plan(uuid,uuid,int,text,jsonb),record_lot_inspection(uuid,jsonb,jsonb,text),complete_deal_phase(uuid,text),create_demo_fixture(text,uuid)
 from public,anon,authenticated;
grant execute on function accept_quote_contract(uuid,uuid),claim_payment_attempt(uuid),record_verified_capture(uuid,jsonb),
 reserve_paid_plan(uuid,uuid,int,text,jsonb),record_lot_inspection(uuid,jsonb,jsonb,text),complete_deal_phase(uuid,text),create_demo_fixture(text,uuid)
 to service_role;
notify pgrst,'reload schema';
commit;
