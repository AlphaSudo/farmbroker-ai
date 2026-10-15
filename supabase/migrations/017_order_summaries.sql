-- 017: versioned order summaries (2.7). Written by projection jobs; buyer reads prefer them.
alter table commerce_jobs drop constraint if exists commerce_jobs_kind_check;
alter table commerce_jobs add constraint commerce_jobs_kind_check
  check (kind in ('ai_plan', 'recovery_advance', 'reconcile_check', 'paypal_event', 'projection', 'procure_bound'));
create table if not exists order_summaries (
  deal_id uuid primary key references deals(id),
  version text not null, summary jsonb not null,
  created_at timestamptz not null default now()
);
alter table order_summaries enable row level security;
