# Native scheduler operation

The SQL `commerce_jobs` queue is the single selected implementation. pg_cron/pg_net wake bounded Vercel Node workers; a browser is not the driver. No PGMQ queue is simultaneously active.

Apply all migrations first. Fresh clones use `DATABASE_URL`. An existing manually applied 001–010 database can explicitly adopt the reviewed baseline:

```sh
node scripts/migrate.mjs --baseline-through=010 --pooler=YOUR_POOLER_HOST --dry-run
node scripts/migrate.mjs --baseline-through=010 --pooler=YOUR_POOLER_HOST
```

The local fallback reads ignored credentials; ordinary installations should provide `DATABASE_URL`. Checksums normalize CRLF to LF. Never adopt an unreviewed database or rewrite an applied migration.

Set `CRON_SECRET` in Vercel production and the ignored `.env.production.local` configuration. Then provision the scheduler inactive:

```sh
node scripts/configure-scheduler.mjs --pooler=YOUR_POOLER_HOST
```

This enables pg_cron/pg_net, encrypts the existing secret in Supabase Vault, creates an owner-only function, and installs one inactive `farmbroker-wake-1min` job. SQL/docs/cron commands contain no secret literal.

After the corrected deployment passes authenticated worker and webhook checks:

```sh
node scripts/configure-scheduler.mjs --pooler=YOUR_POOLER_HOST --enable
```

Each tick performs a bounded sweep and executes at most one job. Completion latency includes up to the scheduler interval plus queue delay; this is a modest demo operating mode, not a high-throughput worker benchmark. Independent worker calls still use SQL admission and fencing. Repeated compliance/binding errors reach review rather than an endless new-key retry.

Verify `cron.job`, `cron.job_run_details`, HTTP delivery results, and the authenticated `GET /api/internal/workers/run` health endpoint. Prove browser independence with an isolated unpaid planning run and no browser advance request. Never use a forged paid row for this check.

Operator fallback: authenticated `POST /api/internal/wake` or `POST /api/internal/workers/run`. If scheduling is disabled, disclose the fallback; do not claim independent progress. Keep only one recurring scheduler active.
