-- 011: database-native supply engine (2.1). Indexed bounded snapshots; JS stays fallback.
-- Safe to run repeatedly (IF NOT EXISTS / OR REPLACE).

-- workload indexes (chosen from hot read paths; verify with EXPLAIN on fixtures)
create index if not exists suppliers_scope_idx on suppliers (pool, crop, available_date) where quantity_kg > 0;
create index if not exists suppliers_fixture_idx on suppliers (pool, fixture_id, crop);
create index if not exists reservations_lot_idx on supply_reservations (supplier_id) where released = false;
create index if not exists allocations_deal_idx on allocations (deal_id);
create index if not exists inspections_alloc_idx on inspections (allocation_id);
create index if not exists events_deal_time_idx on deal_events (deal_id, created_at);
create index if not exists attempts_deal_idx on payment_attempts (deal_id);

-- One bounded snapshot RPC: scalar feasibility + candidate rows + exclusion counts.
-- Totals are computed over ALL eligible lots; the 256-row cap bounds transfer only.
create or replace function get_supply_snapshot(
  p_crop text, p_pool text, p_fixture uuid, p_deadline date, p_include_backup boolean, p_cap int
) returns jsonb language sql stable as $$
with lots as (
  select s.id, s.crop, s.quantity_kg, s.min_price, s.available_date, s.quality_score, s.location,
         coalesce(sum(r.kg) filter (where r.released = false), 0) as committed
  from suppliers s
  left join supply_reservations r on r.supplier_id = s.id
  where s.pool = p_pool
    and (p_fixture is null and s.fixture_id is null or p_fixture is not null and s.fixture_id = p_fixture)
    and lower(s.crop) = lower(p_crop)
    and s.quantity_kg > 0
    and (p_include_backup or coalesce(s.backup_only, false) = false)
    and coalesce(s.quarantined, false) = false
    and (s.available_date is null or s.available_date <= p_deadline)
  group by s.id
),
free as (
  select id, quantity_kg - committed as free_kg, min_price, quality_score, location
  from lots where quantity_kg - committed > 0
),
ranked as (
  select *, row_number() over (order by min_price, id) as rn, count(*) over () as total_lots,
         sum(free_kg) over () as total_kg
  from free
)
select jsonb_build_object(
  'feasible_total_kg', coalesce((select total_kg from ranked limit 1), 0),
  'lot_count', coalesce((select total_lots from ranked limit 1), 0),
  'truncated', coalesce((select total_lots from ranked limit 1), 0) > least(256,greatest(coalesce(p_cap,256),0)),
  'candidates', coalesce((select jsonb_agg(jsonb_build_object('supplier_id', id, 'kg', free_kg, 'rate', min_price, 'quality', quality_score, 'location', location) order by rn) from ranked where rn <= least(256,greatest(coalesce(p_cap,256),0))), '[]'::jsonb),
  'policy', 'fixture+ crop/pool/deadline/backup/quarantine; null dates on-time per fixture policy',
  'cap', least(256,greatest(coalesce(p_cap,256),0))
);
$$;
