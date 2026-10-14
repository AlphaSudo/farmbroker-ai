-- 007: guarantee policy versions (1.6). Rules are data, referenced by incidents/attempts.
create table if not exists guarantee_policies (
  version text primary key,
  rules jsonb not null,
  created_at timestamptz not null default now()
);
insert into guarantee_policies (version, rules) values ('v1', jsonb_build_object(
  'promise', 'deliver accepted contracted quantity/spec/deadline or resolve with full refund',
  'no_partial_completion', true,
  'recovery_attempts_max', 3,
  'entitlements_survive_refund', true,
  'handover', 'simulated receipt event required before fulfillment'
)) on conflict (version) do nothing;
alter table guarantee_policies enable row level security;
