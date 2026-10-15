-- 015: planning policy versions (2.5). Prompt/objective policy is data, not code timing.
create table if not exists planning_policies (
  version text primary key,
  rules jsonb not null,
  created_at timestamptz not null default now()
);
insert into planning_policies (version, rules) values ('v2', jsonb_build_object(
  'strategies', jsonb_build_array('cost-first', 'reliability-first', 'diversity-first'),
  'max_model_calls', 2, 'call_timeout_ms', 8000, 'operation_deadline_ms', 25000,
  'single_flight', true, 'oracle_bound_n', 16
)) on conflict (version) do nothing;
alter table planning_policies enable row level security;
