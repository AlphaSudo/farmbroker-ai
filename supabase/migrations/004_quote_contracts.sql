-- 004: quote contracts (1.3). Counteroffer proposals + expiry index.
create table if not exists counteroffers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id),
  revision_id uuid references quote_revisions(id),
  offered_per_kg numeric not null, decision text not null check (decision in ('accepted','countered','refused')),
  counter_per_kg numeric, reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists quote_revisions_expiry_idx on quote_revisions (request_id, status, expires_at);
alter table counteroffers enable row level security;
