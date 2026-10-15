# Capability table (2.8) — live vs simulated vs future

| Capability | Status | Evidence |
| --- | --- | --- |
| AI intent parse / plan selection / recovery selection | Live provider (free tier), schema-validated, provenance-labeled | runs/steps UI, `/api/evidence` |
| Deterministic feasibility/pricing/settlement math | Live | `npm run eval` 30/30, `npm run verify` |
| PayPal sandbox create/approve | Live | sandbox order IDs in rehearsals |
| PayPal sandbox capture/refund + webhooks | Implemented, provider-blocked | `COMPLIANCE_VIOLATION` tracker `evidence/paypal-blocker.md` |
| Atomic reservations, idempotent commands, event timeline | Live (DB) | migrations 005/012, evals |
| Durable jobs + scheduler | Implemented; cron activation is a dashboard step | `docs/runbook/scheduler.md` |
| Supply snapshots bounded (256) | Implemented; S1 measurement pending | `011`, `perf/supply` probe |
| Inspection/handover/settlement math, supplier payouts | Simulated + labeled | UI labels, receipts |
| Real supplier payouts, carriers, insurers, logistics | Future (out of scope) | — |
