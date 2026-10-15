# Expanded project review for 2.x

Reviewed October 15, 2026; application commit `ce3d468`. This is an architecture/product review for planning, not implementation of 2.x or a formal security audit.

## Inputs and precedence

The review covers the local `hackathon.txt` brief, founder `vision.txt`/`constitution.txt`, `thoughts.txt`/`thinkings.txt`, original 0.x plans, 1.x roadmap, current source, SQL migrations, operational scripts, and retained test/correction reports. The large roadmap JSON is a historical conversation export with 75 messages; its structure/history is background, not evidence that old implementation claims are true. Generated dependencies/build outputs, credential values, and repeated screenshots are not product requirements.

Current source, schema observations, and actual tests take precedence over historical README/pitch claims. The latest user request adds architecture/performance focus; founder identity and the frozen runtime stack remain intact.

## Existing strengths

Postgres transactions already protect quote acceptance, payment claims/receipts, reservations, inspection, recovery commitment, completion, and refund completion. Accepted usable kg is shared across finance/coverage. Uniqueness protects active attempts/refunds. Rejected stock is quarantined. Fixtures isolate backup stock. Model output is validated; missing selection does not pretend to be autonomous success. These are useful foundations to extend.

## Findings that change the plan

| Finding | Current source | Consequence / owner |
| --- | --- | --- |
| AI selection records a choice while initial procurement independently uses cheapest-first | `src/lib/ai/orchestrator.ts`; `src/app/api/procure/route.ts` | Bind decision/plan/quote to execution in 2.2 |
| Strategy candidates can contain the same stock; prompt mainly exposes cost and lot count | `src/lib/procurement/plans.ts`; orchestrator | Add distinct useful tradeoffs and AI ablation in 2.5 |
| Whole supplier pool and reservation rows are fetched before JS filtering | `src/lib/domain/supply.ts` | Bounded SQL snapshots and complete feasibility checks in 2.1 |
| Inventory tables have only identity/uniqueness indexes relevant to current reads | Read-only `pg_indexes` | Add measured supplier/reservation query indexes in 2.1 |
| Browser/request handlers advance runs and perform model I/O | orchestrator, recovery service, plan page | Durable independently triggered work in 2.4 |
| Webhook uses remote verification, skips any previously seen event, and capture-completed only adds a timeline event | `src/app/api/paypal/webhook/route.ts` | A durable inbox/reducer must recover unprocessed events and callback loss in 2.3 |
| Provider calls lack a shared deadline/retry policy; OAuth cache is per warm process | `src/lib/paypal.ts` | Bound wall time, prevent refresh duplication, preserve operation identity in 2.3–2.4 |
| Negotiation UI uses a text-preview route; accept returns to recomputed standard pricing | negotiate page/route | Connect binding revisions; legacy eligibility also omits fixture/free-stock scope; 2.0/2.7 |
| Buyer pages mount/fetch request then fetch another route; ordinary links reload navigation | `src/app/request/**`; `src/components/ui.tsx` | Server-loaded summaries, client islands, deliberate navigation in 2.7 |
| Buyer quality hosts Hub unlock/forms; role-specific reads do not consistently send Hub context | quality page | Separate buyer and operator workflows in 2.7 |
| AG Grid packages are installed but Hub pages currently render HTML tables | `package.json`; `src/app/hub/**` | Implement a useful virtualized operational grid in 2.7; no current sponsor-use claim |
| Bootstrap runs only migration 001; setup/schema docs describe older migrations/Next.js 14 | `scripts/migrate.mjs`; README/architecture/judge docs | Reproducible complete migration setup in 2.0 |
| Reset deletes transaction/audit rows globally; smoke invokes it; supplier reset attempts duplicate insertion | Hub reset, smoke script, Hub suppliers | Retire destructive shared reset and isolate test workflows in 2.0 |
| 92% is a deterministic coverage heuristic, not calibrated fulfillment probability | `src/lib/agents/risk.ts` | Label feasibility score and validate uncertainty separately; 2.0/2.5/2.7 |
| README/pitch/capability declarations exceed retained live financial proof | README/submission/release docs | Correct claim/status matrix in 2.0 and final submission in 2.9 |
| Six blocked HTTP scenarios are appended as fixed notes | `scripts/live-tests.mjs` | Implement actual positive/provider-dependent tests; resolving the provider alone does not make the suite complete |
| Aggregate pool/margin remain buyer-visible in some screens | quote/settlement UI and serializers | Define a consistent boundary; founder allowed aggregate explanation, internal identities/terms stay Hub-only |

Supabase documents a default 1,000-row API cap. This project's specific cap was not inspected; the current helper lacks complete pagination. SQL aggregate/bounded-candidate RPCs should replace whole-pool downloads, not simply raise the API limit. [Supabase select](https://supabase.com/docs/reference/javascript/select)

## Database observations

At review time: PostgreSQL 17.11; maximum connections 60; 115 suppliers, 25 requests, 12 deals, zero allocations/reservations. pg_stat_statements is installed. Available but uninstalled: pgmq 1.5.1, pg_cron 1.6.4, pg_net 0.20.4.

Catalog defaults: statement timeout 120,000 ms, lock timeout 0. Roles/functions may override these. Establish explicit transaction budgets in hot RPCs. Availability of extensions does not prove runtime quotas, activation permissions, scheduling success, or workload capacity.

## Evidence status

- Functional: 57 reachable production checks passed.
- Domain: six targeted regressions passed.
- Database: 18 integration tests passed with provider stubs inside a transaction, then rollback.
- Financial: actual sandbox approval succeeded; capture returned `COMPLIANCE_VIOLATION` again, with no verified paid state. Positive live procurement/refund remains blocked.
- Performance: no retained load/soak/contended-stock/browser results establish high-volume throughput.
- Impact: discovery log is pending. Egyptian bulk-herb processors are the audience hypothesis, not a validated customer base.

The strongest progression connects AI to execution and makes that execution durable and economical under failures. Bounded SQL, native verification/jobs, focused projections, and minimal repair reinforce that progression. Broad sales/export outreach and extra infrastructure do not resolve the present gaps.

Current competitive research also changes the originality claim: Tridge describes AI sourcing, evidence-backed operations, and supply-risk response. The 2.x positioning must be narrower and demonstrated; see [competitive context](competitive-positioning.md). Undocumented competitor capabilities remain unknown.

