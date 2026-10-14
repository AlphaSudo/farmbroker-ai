-- 003: agent runs/steps (1.2). Durable, leased, auditable model decisions.
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references buyer_requests(id),
  deal_id uuid references deals(id),
  kind text not null default 'plan_selection' check (kind in ('plan_selection','recovery_selection','intent_parse')),
  status text not null default 'open' check (status in ('open','decided','executed','paused','failed')),
  policy_version text not null default 'v1',
  snapshot jsonb not null default '{}',
  lease_expires_at timestamptz, attempts int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id),
  kind text not null, input jsonb not null default '{}', output jsonb not null default '{}',
  model text, latency_ms int, validation text,
  op_key text unique, created_at timestamptz not null default now()
);
alter table agent_runs enable row level security;
alter table agent_steps enable row level security;
