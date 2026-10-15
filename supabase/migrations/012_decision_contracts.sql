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
-- Canonical JSON matches the server hash for our bounded decimal plan schema.
create or replace function canonical_json(p_value jsonb) returns text
language plpgsql immutable as $$
declare result text;
begin
 case jsonb_typeof(p_value)
 when 'object' then
   select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||canonical_json(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(p_value);
 when 'array' then
   select '['||coalesce(string_agg(canonical_json(value),',' order by ord),'')||']' into result from jsonb_array_elements(p_value) with ordinality as x(value,ord);
 when 'number' then result := trim_scale((p_value#>>'{}')::numeric)::text;
 else result := p_value::text;
 end case;
 return result;
end $$;

-- Bind the immutable decision to the accepted quote, then reuse the existing
-- reservation kernel. Receipt, reservation, version and events commit together.
create or replace function execute_bound_plan(
  p_command_id text, p_deal_id uuid, p_expected_version int, p_quote_id uuid,
  p_decision_id uuid, p_attempt int, p_op_key text
) returns jsonb language plpgsql as $$
declare
 d deals; r buyer_requests; q quote_revisions; dec decision_records;
 plan procurement_plans; snap planning_snapshots; prior command_receipts;
 items jsonb; kg numeric; cost numeric; actual_hash text; result jsonb;
begin
 if coalesce(p_command_id,'')='' or length(p_command_id)>128 or p_attempt<>1 then raise exception 'invalid bound command'; end if;
 perform pg_advisory_xact_lock(hashtextextended('command:'||p_command_id,0));
 select * into prior from command_receipts where command_id=p_command_id;
 if found then
   if prior.deal_id is distinct from p_deal_id or prior.expected_version is distinct from p_expected_version
      or prior.quote_id is distinct from p_quote_id or prior.decision_id is distinct from p_decision_id then
     raise exception 'command id reused with different input';
   end if;
   return prior.result||jsonb_build_object('replayed',true);
 end if;
 select * into d from deals where id=p_deal_id for update;
 if d.id is null then raise exception 'deal not found'; end if;
 if d.version is distinct from p_expected_version then raise exception 'stale deal version'; end if;
 if d.paypal_verified is null or d.paypal_capture_id is null then raise exception 'paid verification required'; end if;
 select * into r from buyer_requests where id=d.request_id;
 select * into q from quote_revisions where id=p_quote_id;
 if q.id is null or q.status<>'accepted' or q.id is distinct from d.accepted_quote_id
    or q.request_id is distinct from r.id then raise exception 'accepted quote binding mismatch'; end if;
 if not exists(select 1 from payment_attempts where deal_id=d.id and quote_revision_id=q.id
               and status='captured' and usd_minor=q.usd_minor) then raise exception 'capture quote binding mismatch'; end if;
 select * into dec from decision_records where id=p_decision_id;
 if dec.id is null or dec.status<>'valid' or coalesce(dec.model,'')='' then raise exception 'decision invalid'; end if;
 if dec.expires_at<=now() then raise exception 'decision expired'; end if;
 if dec.request_id is distinct from r.id or dec.spec_version<>1 or dec.policy_version<>q.policy_version
    or q.snapshot->>'decision_id' is distinct from dec.id::text
    or q.snapshot->>'plan_hash' is distinct from dec.plan_hash then raise exception 'decision quote binding mismatch'; end if;
 select * into plan from procurement_plans where id=dec.plan_id;
 select * into snap from planning_snapshots where id=plan.snapshot_id;
 if plan.id is null or snap.request_id is distinct from r.id or plan.plan_hash is distinct from dec.plan_hash then raise exception 'stored plan binding mismatch'; end if;
 if snap.snapshot->>'crop' is distinct from r.crop or (snap.snapshot->>'quantity_kg')::numeric is distinct from r.quantity_kg
    or (snap.snapshot->>'delivery_days')::int is distinct from r.delivery_days or snap.snapshot->>'pool' is distinct from r.pool
    or snap.snapshot->>'fixture_id' is distinct from r.fixture_id::text
    or (snap.snapshot->>'max_price')::numeric is distinct from r.max_price then raise exception 'specification binding mismatch'; end if;
 if jsonb_typeof(plan.items)<>'array' or jsonb_array_length(plan.items)>64 then raise exception 'invalid or search-limited plan'; end if;
 select sum((x->>'kg')::numeric),sum((x->>'kg')::numeric*(x->>'rate')::numeric),
        jsonb_agg(jsonb_build_object('supplier_id',x->>'supplier_id','kg',(x->>'kg')::numeric,'cost',round((x->>'kg')::numeric*(x->>'rate')::numeric)))
 into kg,cost,items from jsonb_array_elements(plan.items) x;
 actual_hash := encode(sha256(convert_to(canonical_json(jsonb_build_object('snapshot_id',snap.id,'items',plan.items,'total_kg',kg)),'UTF8')),'hex');
 if actual_hash is distinct from plan.plan_hash or round(cost*100) is distinct from round(plan.cost_total*100) then raise exception 'stored plan hash or totals mismatch'; end if;
 if kg is distinct from r.quantity_kg or cost>d.supplier_cost then raise exception 'plan quantity or cost exceeds contract'; end if;
 perform reserve_paid_plan(d.id,r.id,1,'bound:'||p_command_id,items);
 update deals set version=version+1 where id=d.id;
 result := jsonb_build_object('command',p_command_id,'plan_hash',dec.plan_hash,'kg',kg,'cost',cost,'attempt',1);
 insert into command_receipts(command_id,deal_id,expected_version,quote_id,decision_id,plan_hash,result)
 values(p_command_id,d.id,p_expected_version,q.id,dec.id,dec.plan_hash,result);
 insert into deal_events(deal_id,type,payload,op_key)
 values(d.id,'plan_executed',jsonb_build_object('command',p_command_id,'plan_hash',dec.plan_hash,'decision',dec.id),'bound:'||p_command_id||':executed');
 return result;
end $$;
revoke all on function execute_bound_plan(text,uuid,int,uuid,uuid,int,text) from public,anon,authenticated;
grant execute on function execute_bound_plan(text,uuid,int,uuid,uuid,int,text) to service_role;


