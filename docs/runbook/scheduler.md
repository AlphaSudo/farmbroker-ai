# Native scheduler runbook (2.4) — dashboard steps the repo cannot perform itself

pg_cron/pg_net are available but uninstalled. A database owner runs once in the
Supabase SQL editor:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'farmbroker-wake-5min', '*/5 * * * *',
  $$select net.http_post(
    url := 'https://farmbroker-aii.vercel.app/api/internal/wake',
    headers := '{"x-cron-secret": "<CRON_SECRET>"}'::jsonb
  )$$
);
```

Rules: `<CRON_SECRET>` lives in Supabase protected configuration **and** the Vercel
`CRON_SECRET` env var — never in SQL files, docs, or footage. Vercel Hobby cron
(daily) is insufficient for this schedule; Supabase Cron is the trigger, the wake
route only enqueues bounded idempotent jobs, and `/api/internal/workers/run`
(HUB_KEY or CRON_SECRET) executes them. Verify: `select * from cron.job;` and the
queue health endpoint. If native activation is unavailable, the SQL `commerce_jobs`
table + operator-triggered worker remains the documented fallback — never run both
schedulers without disabling one.
