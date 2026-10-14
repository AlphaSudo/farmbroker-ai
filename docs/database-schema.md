# Database Schema (Supabase Postgres)

```sql
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, crop text not null,
  quantity_kg int not null check (quantity_kg > 0),
  min_price numeric not null check (min_price > 0),
  available_date date, location text,
  quality_score int check (quality_score between 0 and 100),
  pool text not null default 'demo' check (pool in ('demo','full')),
  unique (name, crop, pool)
);
create table buyer_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_name text not null, crop text not null,
  quantity_kg int not null check (quantity_kg > 0),
  delivery_days int not null check (delivery_days between 1 and 30),
  max_price numeric not null check (max_price > 0),
  status text not null default 'open'
    check (status in ('open','quoted','paid','procuring','covered','short','settled','completed')),
  analysis jsonb
);
create table deals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id),
  total_price numeric not null, supplier_cost numeric not null, margin numeric not null,
  per_kg numeric not null default 0, clearing_per_kg numeric not null default 0,
  paypal_order_id text, paypal_capture_id text,
  status text not null default 'quoted'
    check (status in ('quoted','paid','procuring','covered','short','settled','completed')),
  unique (request_id)
);
create table allocations (
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
```

## Locked demo math (frozen)

floor 73,000 (cheapest-first Σ min) → clearing 7.5 (max min) → quote 7.8/kg
(`ceil1(7.5×1.04)`) → total 78,000, supplier_cost 75,000 (clearing pool),
margin 3,000, payouts pro-rata net: 15,000 / 22,500 / 37,500.

## Seed + Dataset

- `scripts/seed-demo.ts`: 3-row video subset (Ahmed 2000/7.0, Mohamed 3000/7.5, Ali 5000/7.3 Mint) + buyer Cairo Foods 10000kg/7d/9max. Deterministic numbers; frozen after 0.4.
- `scripts/import-suppliers.ts`: imports `data/suppliers.csv` (100 rows, header `Supplier Name,Crop,Quantity,Location,Quality Score,Min Price`) for scale tests; demo default stays 3-row.
- RLS: hackathon speed — anon read/write with documented policy (note in README) or RLS off on these 4 tables; service key server-side only.

---
*Stack frozen: Next.js / Node.js / Supabase / AI best-free-key (OpenRouter) / PayPal Sandbox (USD) / Vercel. No changes later.*
