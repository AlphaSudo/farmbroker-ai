-- FarmBroker AI schema v1. Run in Supabase SQL editor OR via scripts/migrate.mjs.
create extension if not exists pgcrypto;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, crop text not null,
  quantity_kg int not null check (quantity_kg > 0),
  min_price numeric not null check (min_price > 0),
  available_date date, location text,
  quality_score int check (quality_score between 0 and 100),
  pool text not null default 'demo' check (pool in ('demo','full')),
  unique (name, crop, pool)
);

create table if not exists buyer_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_name text not null, crop text not null,
  quantity_kg int not null check (quantity_kg > 0),
  delivery_days int not null check (delivery_days between 1 and 30),
  max_price numeric not null check (max_price > 0),
  status text not null default 'open'
    check (status in ('open','quoted','paid','procuring','covered','short','settled','completed')),
  analysis jsonb
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id),
  total_price numeric not null, supplier_cost numeric not null, margin numeric not null,
  per_kg numeric not null default 0, clearing_per_kg numeric not null default 0,
  paypal_order_id text, paypal_capture_id text,
  status text not null default 'quoted'
    check (status in ('quoted','paid','procuring','covered','short','settled','completed')),
  unique (request_id)
);

create table if not exists allocations (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  supplier_id uuid not null references suppliers(id),
  allocated_kg int not null, cost numeric not null,
  quality_grade text check (quality_grade in ('A','B')),
  inspection_status text not null default 'pending'
    check (inspection_status in ('pending','passed','partial','failed')),
  payout_status text not null default 'pending',
  weight_received_kg numeric, moisture_pct numeric, visual_score numeric,
  condition text, usable_kg numeric,
  unique (deal_id, supplier_id)
);
