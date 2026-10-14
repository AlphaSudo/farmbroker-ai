# Project identity and implementation review

Reviewed October 14, 2026 against local commit `c16a286`. This is a source review with local static checks and isolated domain probes. No production data, Supabase state, AI credentials, or live PayPal transaction was inspected or changed. No claim of a fully verified production journey is made.

## Assessment

The concept has a clear identity: a buyer pays FarmBroker for a supply outcome; FarmBroker takes responsibility for assembling supply, accepting quality, and calculating supplier settlement. That ownership is the project's strongest differentiator. The next step is to demonstrate accountability under failure, not expand into unrelated agricultural features.

The source contains the main MVP screens, four-table schema, six named domain modules, PayPal create/capture integration, negotiation, and dataset import. The 0.1-1.0 work is a useful implementation baseline, but several claimed acceptance outcomes are incomplete or contradicted by the current code. Planning checkboxes alone cannot establish release readiness.

## Evidence and consequences

| Finding | Local evidence | Why it matters | Roadmap owner |
| --- | --- | --- | --- |
| Core decisions are mostly deterministic | `src/lib/agents/*.ts`; the only `chatJSON` caller found is `api/negotiate/route.ts` | Removing the model still leaves the core procurement loop. The claimed AI dependency and regenerable analysis are not implemented as documented | 1.2 |
| Short or late supply remains quotable | `agents/risk.ts` uses a confidence threshold rather than hard feasibility | A supply promise can be sold without sufficient on-time quantity | 1.1, 1.4 |
| Wrong-crop supply affects pricing | `api/quote` and `api/deals` pass the entire supplier pool to `pricingAgent` | A Basil supplier can raise the price of a Mint request | 1.1 |
| Buyer budget is stored but not enforced in pricing | `max_price` is accepted in `api/requests`; pricing does not use it | Accepted buyer constraints are not actually contract boundaries | 1.1, 1.3 |
| Pool selection is not persisted | `poolOf(req.url)` is independently read by routes; pages generally omit it | A full-dataset analysis can become a different demo-pool transaction | 1.1, 1.3 |
| No cross-order stock reservation | `api/procure` reads supplier quantity then inserts allocations | Multiple paid orders can consume the same supply; concurrent retries are not fully protected | 1.4 |
| Procurement response includes Hub data | The POST returns `progress(..., "hub")` even to the buyer flow | Supplier names can reach the browser despite being absent from rendered labels | 1.1 |
| Hub and request access is not enforced in inspected handlers | Routes use the service client without actor/ownership checks; `view=hub` changes output | The product's central relationship boundary can be bypassed through APIs | 1.1 |
| Quality controls are in the buyer route | `/request/[id]/quality` defaults to Hub-like forms and fetches named suppliers | Buyer/operations responsibilities and data are mixed | 1.1, 1.7 |
| Settlement can resolve rejected or partial inventory as success | `api/settle` checks only that inspections are no longer pending; GET calls the mutation too | A rejected supply order can appear settled without delivery or remedy | 1.1, 1.6 |
| Completed is a display claim | Settlement writes `settled`; the page always renders a Completed banner after success | Persisted business state and buyer promise disagree | 1.1, 1.7 |
| Finance residual is labeled margin | `financeAgent` subtracts supplier payouts from total, including rejected lots | Unfulfilled buyer obligations can become apparent platform profit | 1.1, 1.5, 1.6 |
| Capture validation is incomplete | `lib/paypal.ts` extracts IDs; handler marks paid without explicit completed/amount/currency/payee checks | A provider response is treated as sufficient payment evidence without a full binding check | 1.1, 1.5 |
| No provider operation journal, verified webhooks, or refund path | Current PayPal helper/routes and four-table schema | Lost callbacks, repeated requests, and failed fulfillment have no durable reconciliation | 1.5 |
| Negotiation does not revise the accepted contract | `api/negotiate` returns text/`agreed`; `api/deals` recomputes the standard quote | The buyer can receive conversational agreement without a corresponding checkout price | 1.3 |
| Supply progress is partly client presentation | Procurement UI schedules local timers after one response | The demo needs to distinguish persisted steps from animation | 1.2, 1.7 |
| Release copy contains stale or unsupported statements | Landing still says features are “coming”; README has submission placeholders; impact/time savings and 100% automation are unmeasured | Judges may see an unfinished product or question its credibility | 1.1, 1.8, 1.9 |

This is a product/implementation review, not a formal security audit. The access observations describe inspected source behavior, not an exploit performed against the deployment.

## Local verification performed

- `npm run lint`: passed, exit 0.
- `npx --no-install tsc --noEmit`: passed, exit 0.
- Existing `scripts/verify-math.mts`: executed locally through the installed TypeScript transpiler, passed `LOCKED-MATH-OK`. The seed retains 78,000 EGP buyer total, 75,000 supplier pool, 3,000 gross spread, and 15,000 / 22,500 / 37,500 settlement amounts.
- Isolated fixture: 7,000 kg supply for a 10,000 kg request returned confidence 65 and `quotable: true`.
- Isolated fixture: all 10,000 kg available 30 days later for a seven-day request returned confidence 90 and `quotable: true`.
- Isolated fixture: buyer maximum 7 EGP/kg still received 7.8 EGP/kg.
- Isolated fixture: adding a Basil supplier at 20 EGP/kg changed a Mint quote from 7.8 to 20.8 EGP/kg.
- Isolated finance fixture: all supply rejected returned supplier payout 0 and reported margin 78,000 EGP.

The domain probes ran in memory without DB/provider calls. They substantiate the findings above but do not replace integration tests. A production build, live model execution, sandbox approval/capture/refund, concurrency against Postgres, video publication, public repository availability, and actual Devpost submission were not verified in this review. The existing `scripts/e2e.mjs` stops after order creation and mutates its target; do not describe its eight checks as a complete captured-and-fulfilled journey.

## Product direction

Start with Egyptian food processors sourcing bulk herbs for a domestic hub. This is a focus hypothesis for validation, not a researched market-size claim. Use the 10-ton Mint transaction to make the mechanism clear; explain that the current 2-5 ton demo lots represent supplier lots/aggregations rather than evidence about individual smallholder farm size.

The technical differentiator to prove is **recovering a paid supply commitment within explicit constraints**. AI should choose among feasible plans and remedies using database facts. Deterministic validators should reject unsupported, over-budget, late, duplicate, or privacy-breaking actions.

Pursue user evidence early: aim for three buyer/operations conversations and two supplier-side conversations, without contacting anyone automatically. Record observations, permissions for quotes, and uncertainty. If contacts are unavailable, run clearly labeled proxy usability sessions and keep demand validation unproven.

See [the roadmap](README.md) for sequencing and the nine implementation plans.
