-- One SQL queue/outbox, bounded leases and database-enforced admission.
create table if not exists commerce_jobs (
 id uuid primary key default gen_random_uuid(), op_key text unique not null,
 scope text not null, kind text not null check(kind in ('ai_plan','recovery_advance','reconcile_check','paypal_event','projection','procure_bound')),
 payload jsonb not null default '{}', expected_version int,
 attempt int not null default 0, max_attempts int not null default 5,
 deadline timestamptz, next_attempt_at timestamptz not null default now(),
 status text not null default 'queued' check(status in ('queued','leased','done','failed','review')),
 lease_token uuid, lease_expires_at timestamptz, result jsonb, error text,
 created_at timestamptz not null default now()
);
create index if not exists jobs_due_idx on commerce_jobs(status,kind,next_attempt_at);
alter table commerce_jobs enable row level security;

create or replace function claim_due_job(p_worker text,p_kinds text[]) returns setof commerce_jobs language plpgsql as $$
declare r commerce_jobs; ai_busy int;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('commerce-admission',0)) then return; end if;
 update commerce_jobs set status=case when attempt>=max_attempts or deadline<=now() then 'review' else 'queued' end,
   lease_token=null,lease_expires_at=null,error='worker lease expired'
 where id in(select id from commerce_jobs where status='leased' and lease_expires_at<=now() limit 100 for update skip locked);
 update commerce_jobs set status='review',error='job deadline or attempt limit reached'
 where id in(select id from commerce_jobs where status='queued' and (deadline<=now() or attempt>=max_attempts) limit 100 for update skip locked);
 select count(*) into ai_busy from commerce_jobs where status='leased' and kind in ('ai_plan','recovery_advance') and lease_expires_at>now();
 select * into r from commerce_jobs where status='queued' and kind=any(p_kinds)
   and next_attempt_at<=now() and (deadline is null or deadline>now()) and attempt<max_attempts
   and (kind not in ('ai_plan','recovery_advance') or ai_busy<2)
 order by case kind when 'paypal_event' then 0 when 'reconcile_check' then 1 when 'projection' then 3 else 2 end,created_at,id
 limit 1 for update skip locked;
 if not found then return; end if;
 update commerce_jobs set status='leased',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',attempt=attempt+1
 where id=r.id returning * into r;
 return next r;
end $$;

create or replace function finish_commerce_job(p_id uuid,p_token uuid,p_result jsonb,p_error text) returns boolean language plpgsql as $$
begin
 update commerce_jobs set
  status=case when p_error is null then 'done' when attempt>=max_attempts or deadline<=now()
    or p_error~*'COMPLIANCE_VIOLATION|binding mismatch|contract changed' then 'review' else 'queued' end,
  result=case when p_error is null then p_result else result end,error=p_error,
  next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempt)::int*30)+floor(random()*15)::int),
  lease_token=null,lease_expires_at=null
 where id=p_id and lease_token=p_token and status='leased' and lease_expires_at>now();
 return found;
end $$;

-- A planning run and its work message are a single commit.
create or replace function enqueue_planning_run() returns trigger language plpgsql as $$
begin
 if new.kind='plan_selection' then
  insert into commerce_jobs(op_key,scope,kind,payload,deadline)
  values('plan:'||new.id,new.request_id::text,'ai_plan',jsonb_build_object('runId',new.id),now()+interval '24 hours') on conflict(op_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists planning_run_job on agent_runs;
create trigger planning_run_job after insert on agent_runs for each row execute function enqueue_planning_run();

-- Verified capture and execution admission cannot be separated by a process crash.
create or replace function enqueue_paid_plan() returns trigger language plpgsql as $$
declare quote quote_revisions;
begin
 if new.status='paid' and old.status is distinct from new.status then
  select * into quote from quote_revisions where id=new.accepted_quote_id;
  if quote.snapshot->>'decision_id' is not null then
   insert into commerce_jobs(op_key,scope,kind,payload,expected_version,deadline)
   values('paid-plan:'||new.id||':'||quote.id,new.id::text,'procure_bound',
     jsonb_build_object('dealId',new.id,'quoteId',quote.id,'decisionId',quote.snapshot->>'decision_id'),new.version,now()+interval '30 minutes') on conflict(op_key) do nothing;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists paid_plan_job on deals;
create trigger paid_plan_job after update of status on deals for each row execute function enqueue_paid_plan();

create or replace function ingest_paypal_event(p_event jsonb,p_method text) returns jsonb language plpgsql as $$
declare completed boolean;
begin
 insert into paypal_events(event_id,type,payload,processed,verified_by)
 values(p_event->>'id',p_event->>'event_type',p_event,'received',p_method) on conflict(event_id) do nothing;
 select processed='processed' into completed from paypal_events where event_id=p_event->>'id';
 if not completed then
  insert into commerce_jobs(op_key,scope,kind,payload,deadline)
  values('paypal-event:'||(p_event->>'id'),'provider','paypal_event',jsonb_build_object('eventId',p_event->>'id'),now()+interval '3 days') on conflict(op_key) do nothing;
 end if;
 return jsonb_build_object('ok',true,'replayed',completed);
end $$;

create or replace function commit_job_recovery(p_job uuid,p_token uuid,p_incident uuid,p_plan jsonb,p_model text,p_op_key text)
returns jsonb language plpgsql as $$
declare j commerce_jobs; i shortage_incidents;
begin
 select * into j from commerce_jobs where id=p_job for update;
 select * into i from shortage_incidents where id=p_incident;
 if j.id is null or j.status<>'leased' or j.lease_token is distinct from p_token or j.lease_expires_at<=now()
  or j.kind<>'recovery_advance' or j.payload->>'dealId' is distinct from i.deal_id::text then raise exception 'worker lease or scope changed'; end if;
 return commit_recovery_plan(p_incident,p_plan,p_model,p_op_key);
end $$;
revoke all on function claim_due_job(text,text[]),finish_commerce_job(uuid,uuid,jsonb,text),ingest_paypal_event(jsonb,text),commit_job_recovery(uuid,uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function claim_due_job(text,text[]),finish_commerce_job(uuid,uuid,jsonb,text),ingest_paypal_event(jsonb,text),commit_job_recovery(uuid,uuid,uuid,jsonb,text,text) to service_role;
