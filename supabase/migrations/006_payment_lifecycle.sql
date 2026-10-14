-- 006: payment lifecycle indexes (1.5). Tables in 002; unique provider IDs enforce dedupe.
create unique index if not exists payment_attempts_order_uidx on payment_attempts (provider_order_id) where provider_order_id is not null;
create index if not exists ledger_deal_idx on ledger_entries (deal_id, created_at);
create index if not exists events_deal_idx on deal_events (deal_id, created_at);
