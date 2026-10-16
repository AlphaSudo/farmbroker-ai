# Capability table — verified behavior and remaining proof

| Capability | Status | Evidence |
| --- | --- | --- |
| AI plan selection | Actual provider call passed in the production harness | 65 passing reachable checks; model/run provenance |
| Rich semantic priorities / autonomous recovery selection | Partial integration / positive paid proof pending | Release audit |
| Deterministic feasibility/pricing/settlement | Verified offline | 30 evals, six domain regressions, locked math |
| PayPal sandbox create/approval | Fresh actual browser approval verified | Native-verified approval event in live release evidence |
| PayPal capture/refund | Positive financial loop unverified | Fresh approved-order capture compliance rejection; later lookup 500 |
| Webhook registration / unsigned rejection | Actual registration and deployed rejection verified | Production env and HTTP checks |
| Authentic native signature verification | One actual approval event verified | Live release evidence; 12 additional mechanics checks use ephemeral certificates |
| Authentic native/postback signature comparison | Pending | One native event does not prove corpus parity |
| Atomic reservations / bound commands / leases / inbox | Verified in 35 rolled-back DB integration checks with provider/model stubs | Reproducible `database-regressions.mjs --with-migrations` |
| Durable scheduler | Active; completed real AI planning with the scenario tab closed | Live release evidence; no browser advance/manual worker call for the successful run |
| Supply snapshot bounded to 256 | SQL totals/cap tested beyond 1,000 rows | DB suite; no 100k DB workload claim |
| Offline 100k planning probe | In-memory timing only; ~23KB transfer is estimated | `scripts/perf/supply.mjs` |
| Inspection/handover/supplier payouts | Simulated, labeled; entitlements calculated | No real logistics or supplier payout |
| Higher-cost margin-funded repair | Helper exists; authoritative v2 integration pending | v1 clearing policy retained |
| Audience impact / load-soak / video | Pending | Discovery, benchmark, submission gates |

See [release audit](v2.9-release-audit-2026-10-16.md). Shipped files and provider-independent tests are not a completed paid operating journey.
