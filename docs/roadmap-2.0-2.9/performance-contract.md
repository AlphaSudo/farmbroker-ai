# 2.x workload and performance contract

All numbers below are **proposed engineering targets**, not measured current capabilities. Lock environment/baseline in 2.0 before interpreting speedups.

## Measurement rules

Record commit/schema, hosting tier/hardware, DB/function regions, dataset seed/counts, duration, arrival rate, concurrency, cache state, payload bytes, correctness, and provider mode.

Separate browser time, application time, SQL execution, queue wait, model latency, PayPal latency, and completed-work latency. A faster `202 Accepted` is faster acknowledgement, not faster completed procurement. Report both.

Publish all attempted outcomes and success-only breakdowns. Expected stock conflicts, overload rejections, provider failures, and unexpected errors have separate counts. Rapid rejection of most requests is not useful throughput.

## Workloads

| Profile | Dataset / arrivals | What it establishes |
| --- | --- | --- |
| S0 functional | Locked 3-lot, recovery-with-backup, no-backup fixtures | Same business math/guards; no scale claim |
| S1 target | 100,000 synthetic active lots, 1,000,000 history rows; 50 reads/s + 5 independent commands/s, 10 min | Useful bounded hot paths on the declared environment |
| S2 contention | 100 simultaneous commands competing for 10 lots, plus unrelated orders | No oversell, bounded waits, progress outside the hot set |
| S3 failures | Provider 429/malformed JSON/timeout-after-effect, duplicate/out-of-order event, worker crash/stale lease | Durable convergence and honest degraded UX |
| S4 soak | 10 reads/s + 1 command/s, 60 min after S1 fits budget | Stable queues, memory, connections |
| S5 browser | 390px mobile and 1440px desktop, recorded network/CPU profile | Useful render/interaction latency and accessible workflow |

S1 reads: 20 summary/s, 20 quote/s, 10 Hub page/s. Commands: 2 reservations/s, 2 inspections/s, 1 completion/recovery/s. Provide enough independent fixture stock to avoid depletion disguising performance; publish completed count/conflicts.

Include crop/Hub skew, quarantined/late/partial stock, 1,001/10,000/100,000-lot cases, and fragmentation beyond the synchronous item cap. Bounded search exhaustion is different from proven insufficient supply.

Use an **isolated benchmark project/deployment** and an explicit test-only provider adapter. It cannot be selected by a browser header or production request. Stub latency/faults are documented. Actual PayPal/AI smoke journeys form a separate low-volume lane. Do not load-test free providers or forge paid state in the public demo database.

If S1 exceeds free resources, retain S1-small: 10,000 lots / 100,000 history / 10 reads/s / 1 command/s. Label the environment where each result was measured; a paid benchmark does not establish free-demo capacity.

## Initial budgets

| Operation | Proposed target / condition | Required evidence |
| --- | --- | --- |
| Supply snapshot | SQL p95 ≤100 ms; ≤256 candidate rows, ≤64 selected lots for synchronous class | Plan/buffers, bytes, cap/exhaustion outcomes |
| Warm deterministic read/quote | Application p95 ≤300 ms, p99 ≤800 ms in S1 | Auth, SQL, serialization; caller-network time separately |
| Stock commit | SQL transaction p95 ≤150 ms without hot contention; lock budget ≤150 ms | Completed commits, conflicts, deadlocks, no oversell |
| Durable command acknowledgement | Application p95 ≤250 ms | Queue wait and business completion separately |
| Verified webhook ingest | Warm local signature check + durable inbox/enqueue p95 ≤250 ms | Cold certificate time and postback comparison |
| Healthy low-volume AI planning | Completion target p95 ≤8 s under admitted load | Sample size/provider/tokens/queue/timeouts; no SLA from tiny sample |
| Recovery internal work | ≤2 s excluding provider/model/queue | Gap size, changed commitments, retained kg, spend cap |
| Buyer first useful content | ≤2.5 s in stated S5 lab conditions | Cold/warm, TTFB, JS, waterfall, errors |
| Buyer/Hub interaction | p95 ≤200 ms on stated device | Critical-action traces and long tasks |
| Hub grid | First ≤100 rows; ≤10 cached blocks | Fetched rows, memory, long tasks, dataset count |

Caps are a supported-workload policy. Larger fragmented orders move to bounded background planning/review, not a false out-of-stock conclusion. Revisit targets after baseline measurements; publish the reason for changes rather than silently weakening a failed gate.

## Correctness gates

Zero oversell; zero duplicate financial effects; no commitment before verified live capture; no accepted kg beyond measurements; no settlement/fulfillment below contract quantity; no expired/mismatched decision execution; no lost accepted supplier entitlement after refund; no cross-owner data through caches/projections/events.

## Implementation and reporting

Add `src/instrumentation.ts`, domain/provider/SQL spans, opaque request/command IDs, and safe Server-Timing. Sample successful reads; retain financial mutation/failure traces. Do not log full briefs, keys, or raw sensitive payloads.

Use EXPLAIN/BUFFERS on isolated fixtures and pg_stat_statements deltas. Profile bytes, repeated RPCs, planning CPU, index usage, lock waits, and query growth. Catalog inspection alone proves no latency target.

Use an open-loop arrival-rate harness, recording dropped iterations/generator saturation. [k6 arrival-rate guidance](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)

Repeat comparable optimizations at least three times with identical data/conditions/correctness checks. Report run-level median/range and raw histograms, not the best run. Hold out scenario seeds from tuning.

## Ablations

| Comparison | Hold fixed | Claim tested |
| --- | --- | --- |
| Current JS scan → SQL snapshot | Same supply and pricing policy | Less transfer/latency without false feasibility |
| Current region → verified DB-near region | Build/tier/data/cache | Network contribution |
| PayPal postback → native signature verification | Same authentic events and validity decisions | Warm verification network dependency removed |
| Browser-driven → durable worker | Commands and injected failures | Recovery after closure/restart |
| Full plan rebuild → minimal repair | Same accepted stock and shortage | Less computation and commitment churn |
| Cost-first → optimizer only → AI + optimizer | Same request/evidence/budget | Actual AI contribution and cases where it adds no benefit |
| Client waterfall → server-loaded summary | Permissions/rendered content | Earlier useful content and less JavaScript |

Track CPU, connections, bytes, invocations, oldest job age, provider calls/tokens, and cost per completed order. Initially cap AI concurrency at two and reserve payment/reconciliation capacity separately. Free-tier quotas are verified deployment inputs. The current 60-connection DB is a boundary to measure, not an invitation to open one connection per browser.

