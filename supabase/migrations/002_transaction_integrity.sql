-- 002: transaction integrity (1.1). Run AFTER 001. Idempotent-ish via IF NOT EXISTS (columns guarded by DO blocks).
create extension if not exists pgcrypto;

-- buyer_requests: persisted source dataset, scenario, owner, timestamps, accepted quote
alter table buyer_requests add column if not exists pool text not null default 'demo' check (pool in ('demo','full'));
alter table buyer_requests add column if not exists scenario text not null default 'happy-path';
alter table buyer_requests add column if not exists owner_token uuid not null default gen_random_uuid();
alter table buyer_requests add column if not exists accepted_quote_id uuid;
alter table buyer_requests add column if not exists created_at timestamptz not null default now();

-- immutable quote revisions (minor units + FX snapshot)
create table if not exists quote_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id),
  version int not null,
  per_kg numeric not null, total_minor int not null, currency text not null default 'EGP',
  usd_minor int not null, usd_currency text not null default 'USD', fx jsonb not null,
  delivery_deadline date not null, spec jsonb not null default '{}',
  expires_at timestamptz not null, status text not null default 'draft'
    check (status in ('draft','accepted','expired','superseded')),
  accepted_at timestamptz, accepted_by uuid,
  snapshot jsonb not null, policy_version text not null default 'v1',
  created_at timestamptz not null default now(),
  unique (request_id, version)
);

-- deals: accepted quote binding, verified capture evidence, outcome (never infer fulfilled)
alter table deals add column if not exists accepted_quote_id uuid references quote_revisions(id);
alter table deals add column if not exists paypal_verified jsonb;
alter table deals add column if not exists outcome text not null default 'pending'
  check (outcome in ('pending','fulfilled','refunded','needs_review'));
alter table deals add column if not exists completed_at timestamptz;
alter table deals add column if not exists handover_at timestamptz;

-- append-only domain events with idempotency keys
create table if not exists deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  type text not null, payload jsonb not null default '{}',
  op_key text unique, created_at timestamptz not null default now()
);

-- allocations: attempts (retry keeps history)
alter table allocations add column if not exists attempt int not null default 1;
alter table allocations drop constraint if exists allocations_deal_id_supplier_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'allocations_deal_supplier_attempt_key') then
    alter table allocations add constraint allocations_deal_supplier_attempt_key unique (deal_id, supplier_id, attempt);
  end if;
end $$;

-- paid stock reservations (1.4)
create table if not exists supply_reservations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  supplier_id uuid not null references suppliers(id),
  kg int not null check (kg > 0), attempt int not null default 1,
  op_key text unique, released boolean not null default false,
  created_at timestamptz not null default now()
);

-- append-only inspections (1.6)
create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references allocations(id),
  attempt int not null, weight_received_kg numeric not null, usable_kg numeric not null,
  moisture_pct numeric not null, visual_score numeric not null, condition text not null,
  decision text not null check (decision in ('passed','partial','failed')),
  grade text check (grade in ('A','B')), inspector text not null default 'hub',
  policy_version text not null default 'v1', op_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists shortage_incidents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  missing_kg numeric not null, status text not null default 'open'
    check (status in ('open','recovering','resolved','refund_eligible','refunded')),
  op_key text unique, created_at timestamptz not null default now()
);

create table if not exists recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references shortage_incidents(id),
  plan jsonb not null, status text not null default 'proposed'
    check (status in ('proposed','committed','inspected','failed')),
  op_key text unique, created_at timestamptz not null default now()
);

-- payment lifecycle (1.5)
create table if not exists payment_attempts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  quote_revision_id uuid references quote_revisions(id),
  usd_minor int not null, status text not null default 'created'
    check (status in ('created','approved','captured','failed','expired')),
  provider_order_id text, op_key text unique,
  created_at timestamptz not null default now()
);
create table if not exists provider_operations (
  id uuid primary key default gen_random_uuid(),
  kind text not null, op_key text unique not null, status text not null,
  payload jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists paypal_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null, type text not null, payload jsonb not null default '{}',
  processed text not null default 'pending', created_at timestamptz not null default now()
);
create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  capture_id text not null, usd_minor int not null,
  status text not null default 'requested'
    check (status in ('requested','pending','completed','failed','needs_review')),
  provider_refund_id text, reason text not null, policy_version text not null default 'v1',
  op_key text unique, created_at timestamptz not null default now()
);
create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  kind text not null, egp_minor int not null default 0, usd_minor int not null default 0,
  note text not null default '', created_at timestamptz not null default now()
);

-- deny direct anon access; service-role server handlers authorize explicitly
alter table suppliers enable row level security;
alter table buyer_requests enable row level security;
alter table deals enable row level security;
alter table allocations enable row level security;
alter table quote_revisions enable row level security;
alter table deal_events enable row level security;
alter table supply_reservations enable row level security;
alter table inspections enable row level security;
alter table shortage_incidents enable row level security;
alter table recovery_attempts enable row level security;
alter table payment_attempts enable row level security;
alter table provider_operations enable row level security;
alter table paypal_events enable row level security;
alter table refunds enable row level security;
alter table ledger_entries enable row level security;
