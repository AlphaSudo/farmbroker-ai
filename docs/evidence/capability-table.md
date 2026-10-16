# Capability table — verified behavior and remaining proof

| Capability | Status | Evidence |
| --- | --- | --- |
| AI plan selection | Actual provider call passed in the production harness | 65 passing reachable checks; model/run provenance |
| Rich semantic priorities / autonomous recovery selection | Partial integration / positive paid proof pending | Release audit |
| Deterministic feasibility/pricing/settlement | Verified offline | 30 evals, six domain regressions, locked math |
| PayPal sandbox create/approval | Create verified; earlier original approval retained | Actual sandbox order IDs |
| PayPal capture/refund | Positive financial loop unverified | Earlier compliance rejection; latest original-order lookup 500 |
| Webhook registration / unsigned rejection | Actual registration and deployed rejection verified | Production env and HTTP checks |
| Authentic native/postback signature comparison | Pending | 12 mechanics checks use ephemeral certificates |
| Atomic reservations / bound commands / leases / inbox | Verified in 35 rolled-back DB integration checks with provider/model stubs | Reproducible `database-regressions.mjs --with-migrations` |
| Durable scheduler | Provisioned through native Cron/pg_net and Vault; activate after corrected deployment | Scheduler runbook and independent-run artifact |
| Supply snapshot bounded to 256 | SQL totals/cap tested beyond 1,000 rows | DB suite; no 100k DB workload claim |
| Offline 100k planning probe | In-memory timing only; ~23KB transfer is estimated | `scripts/perf/supply.mjs` |
| Inspection/handover/supplier payouts | Simulated, labeled; entitlements calculated | No real logistics or supplier payout |
| Higher-cost margin-funded repair | Helper exists; authoritative v2 integration pending | v1 clearing policy retained |
| Audience impact / load-soak / video | Pending | Discovery, benchmark, submission gates |

See [release audit](v2.9-release-audit-2026-10-16.md). Shipped files and provider-independent tests are not a completed paid operating journey.
