-- 014: native durable jobs (2.4). SQL job table + claim with SKIP LOCKED + fencing.
-- pg_cron/pg_net activation itself is a dashboard step (see docs/runbook/scheduler.md).
create table if not exists commerce_jobs (
  id uuid primary key default gen_random_uuid(),
  op_key text unique not null,
  scope text not null, kind text not null check (kind in ('ai_plan','recovery_advance','reconcile_check')),
  payload jsonb not null default '{}', expected_version int,
  attempt int not null default 0, max_attempts int not null default 5,
  deadline timestamptz, status text not null default 'queued'
    check (status in ('queued','leased','done','failed','review')),
  lease_token uuid, lease_expires_at timestamptz,
  result jsonb, error text, created_at timestamptz not null default now()
);
create index if not exists jobs_due_idx on commerce_jobs (status, kind, created_at);

create or replace function claim_due_job(p_worker text, p_kinds text[]) returns setof commerce_jobs language plpgsql as $$
declare r commerce_jobs%rowtype;
begin
  select * into r from commerce_jobs
    where status = 'queued' and kind = any(p_kinds)
      and (deadline is null or deadline > now())
    order by created_at limit 1 for update skip locked;
  if not found then return; end if;
  update commerce_jobs set status = 'leased', lease_token = gen_random_uuid(),
    lease_expires_at = now() + interval '5 minutes', attempt = attempt + 1
    where id = r.id returning * into r;
  return next r;
end $$;
alter table commerce_jobs enable row level security;
