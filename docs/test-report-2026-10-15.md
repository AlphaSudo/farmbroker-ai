# FarmBroker AI test results: October 15, 2026

> Historical baseline before corrections. For the implemented fixes and current validation, see [the correction report](regression-fixes-2026-10-15.md).

**Release gate: failed.** The code builds, but the deployed 1.x workflow has confirmed defects and could not complete a paid fulfillment/refund journey.

Target: `https://farmbroker-aii.vercel.app`. Deployed application commit: `0175cc7801976648a72a104fd3758b2e76010a79`. Deployment: `GyHoxwGXfDbXM3ibvTmZSN32Qh6U`. This testing session added test scripts and this report; application behavior/configuration was not patched to hide failures.

## Results

| Check | Result | What this proves |
| --- | --- | --- |
| Production build | Passed | Compilation, framework build, and build-time TypeScript checks |
| ESLint, including added scripts | Passed | Static lint checks |
| `tsc --noEmit` | Passed | Standalone type checking |
| Existing offline eval | 30 passed | Existing fixture checks; two are unconditional placeholders |
| Existing locked-math verification | Passed | Happy-path 78,000 / 75,000 / 3,000 EGP arithmetic |
| New live API/database harness | **41 passed, 11 failed, 6 blocked** | Actual authorization, quote, payment-attempt, model, recovery, and schema behavior |
| New focused domain regressions | **2 passed, 4 failed** | Actual quality/finance and plan-validation defects missed by the old suite |
| PayPal approval | Passed | Sandbox buyer approved the actual 1,625.00 USD order |
| PayPal capture | **Blocked by provider** | Sandbox capture returned `COMPLIANCE_VIOLATION`; no successful capture exists |

Do not sum these into a single quality percentage. The old suite contains `t("replay-refund-cap", true)` and `t("replay SAME-opkey", true)` and does not establish those live guarantees. The new tests intentionally exit nonzero while defects remain.

## Payment evidence and limitation

Primary browser request: `85f42817-e5ba-46d0-910c-524fddd39eb5`.

Primary deal: `ace676b6-15f5-441a-9dd1-84c3cae4c036`.

Sandbox order: `23M81863VE120800C`; amount: **1,625.00 USD**, equivalent to the accepted 78,000 EGP quote at the fixed demo rate.

The buyer signed in to the actual PayPal Sandbox approval page using the locally stored sandbox account and approved the order. The SDK popup did not expose a usable checkout tab in the in-app browser, so the provider-issued approval URL was opened directly. Capture was then attempted through the application's capture endpoint. This is provider approval plus API testing, not a claim that the SDK browser callback journey passed.

- Provider order state observed: `APPROVED`.
- Application capture endpoint: HTTP 500, `PayPal capture failed (422)`.
- Direct sandbox provider diagnostic: HTTP 422, `UNPROCESSABLE_ENTITY`, issue `COMPLIANCE_VIOLATION`.
- Provider debug ID: `f93426302b179`.
- Application deal stayed `quoted`, capture ID stayed null, and verified-payment evidence stayed absent.
- Procurement continued to reject unpaid execution with HTTP 403.

No test forged a capture, wrote fake verified-payment data, or marked a production deal paid. The provider rejection requires investigation of the sandbox account/payment setup through PayPal; the observed response does not identify a more specific cause.

Consequently these six positive live scenarios remain blocked: paid procurement/inventory concurrency; actual 2,000 kg lot rejection; committed/inspected AI replacement; final settlement and handover; a separately captured refund fixture; and replay of completed capture/refund operations. Their unpaid guards were tested where possible. A refund without a capture correctly returned 422; that does not prove successful refunds or refund caps.

## Confirmed failures, in implementation order

### 1. Negotiation accepts a price below the supplier floor

**Live reproduction:** create a 10,000 kg Mint request with max price 9 EGP/kg, then `POST /api/counteroffers` with `offered: 1`. The server returns a draft at **4.5 EGP/kg**, despite the actual floor being **7.5 EGP/kg**. Accepting that revision returns HTTP 200 and an accepted deal at 4.5.

Source: `src/app/api/counteroffers/route.ts:31`; acceptance also lacks an independent supply-floor validation in `src/lib/domain/revisions.ts` / `src/app/api/quotes/[id]/accept/route.ts`.

Fix direction: derive permissible terms from a feasible plan, clamp/refuse infeasible counters, and revalidate economics independently at acceptance and payment creation. Do not rely on reply text or only the buyer's maximum.

### 2. Concurrent checkout creates two active payment attempts

Two simultaneous create-order requests for the same accepted deal both returned HTTP 200 and different sandbox order IDs:

- `21K813014D8155454`
- `1B310011P3221391J`

Database inspection found **two active attempts**. They remain unapproved/unpaid; this test did not cause duplicate charges.

Source: `src/app/api/paypal/create-order/route.ts:40`. The read-before-create sequence is not serialized, and the current schema has no one-active-attempt-per-deal constraint.

Fix direction: claim a single active attempt atomically before the provider request, enforce the invariant in Postgres, and persist/reuse a stable provider operation ID. Sequential retries already reuse an existing order; that does not resolve the concurrency failure.

### 3. Accepted quantity and supplier entitlement can exceed reality

The focused tests found:

- An allocation of 1,000 kg receiving 2,000 kg returns `usable_kg: 2000`; no cap is applied.
- A 950 kg delivery against 1,000 kg is classified `passed` and records 950 usable kg, but finance pays for **1,000 kg**.

Source: `src/lib/agents/quality.ts:24`, `src/lib/agents/finance.ts:10`. The live settlement/recovery coverage helpers also count `allocated_kg` for passed lots, so this disagreement affects fulfillment readiness as well as payout math. That downstream effect is source-backed; a captured production fixture was unavailable to execute it end-to-end.

Fix direction: make accepted usable quantity authoritative and bounded by received/allocated quantity across quality, coverage, settlement, and handover.

### 4. Plan validation permits invented rates and duplicate stock

Actual domain calls accepted both a zero-rate allocation for a supplier whose minimum is 7.5 EGP/kg, and two 1,000 kg items referencing the same 1,000 kg supplier lot.

Source: `src/lib/procurement/plans.ts:31`.

Fix direction: validate finite positive quantities and rates against authoritative supplier terms; aggregate quantities by supplier/lot before checking capacity. These are function-level failures, not a claim that the live paid reservation RPC allowed double allocation.

### 5. Unpaid recovery creates a shortage incident and then fails

On a dedicated unpaid test deal, `POST /api/recovery` returned HTTP 500 and left **one open 10,000 kg shortage incident**. No allocations committed. Recovery should reject unpaid/uninspected deals before creating incidents or calling the model.

An independent, nonmutating RPC diagnostic confirmed `PGRST202`: the caller requests `reserve_paid_plan(op_key, ...)`, whereas the deployed function expects `p_op_key`. The caller also passes an empty string for a UUID request ID.

Source: `src/app/api/recovery/route.ts`, `src/lib/recovery/service.ts:80`, `supabase/migrations/005_supply_reservations.sql:5`.

Fix direction: add payment/inspection/outcome guards before side effects, pass the real request ID and correct argument name, and validate that incident and reservation writes can resume safely.

### 6. Live AI selection currently produces no valid decision

The deployed advance endpoint returned HTTP 502 after approximately 10.6 seconds; the run was persisted as `paused`.

Provider diagnostics established that both configured model IDs exist and the API key authenticates. The failures are more specific:

| Model | Actual diagnostic result |
| --- | --- |
| `thinkingmachines/inkling:free` | HTTP 403: available only on the provider's supported agentic harnesses |
| `nvidia/nemotron-3.5-lightning:free` | HTTP 200 with `content: null`, `finish_reason: length`, and reasoning present at the configured 400-token budget |

Source: `src/lib/ai.ts` and `src/lib/ai/orchestrator.ts`.

Fix direction: use a model permitted for this integration and a tested reasoning/output budget; retain provider diagnostics instead of swallowing all failures into null. Verify actual JSON decision output before claiming live AI plan/recovery selection.

### 7. Hub queue silently hides existing deals

The authenticated queue returned HTTP 200 with zero deals after test deals had been created. A direct schema check returned `column deals.created_at does not exist`. The browser likewise showed an empty deals table while displaying the unpaid incident created by the recovery bug.

Source: `src/app/api/hub/queue/route.ts:15`; `002_transaction_integrity.sql` adds a request timestamp but does not add the deal timestamp that the queue queries.

Fix direction: add the missing schema migration or use an existing ordering field, and propagate database query errors instead of converting them into an empty queue. Audit similar swallowed query errors in Hub finance responses.

### 8. Buyer responses expose fields the intended boundary excludes

- Request creation returns `owner_token` in JSON while also putting it in an HttpOnly cookie. That exposes the caller's token to page JavaScript; cross-buyer authorization checks did pass.
- Quote acceptance returns the raw deal containing `supplier_cost`, despite the buyer/internal finance separation.

Source: `src/app/api/requests/route.ts:31-35`, `src/app/api/deals/route.ts:31-45`.

Fix direction: return a request ID and purpose-built buyer DTOs. Apply the serializers to mutation responses as well as read endpoints.

### 9. Required recovery standby fixture is absent

The demo pool has exactly **10,000 kg Mint**. A 10,000 kg primary allocation leaves no independent 2,000 kg standby lot for the requested replacement demonstration. This is a fixture-readiness failure, separate from the recovery RPC defect.

Fix direction: create a clearly labeled, isolated recovery fixture with enough pre-existing backup capacity. Keep the locked three-supplier happy fixture and no-backup refund fixture separate; do not add stock secretly after a failure.

## Checks that passed

Live checks verified anonymous/other-buyer rejection, Hub-key authorization, quantity validation, persisted pool selection, the 78,000 EGP baseline quote, hard insufficient-supply/budget/no-crop rejection, sequential acceptance reuse, unpaid procurement denial, pre-inspection settlement denial, pre-settlement handover denial, no-capture refund denial, read-only settlement GET, and an independent database paid-verification guard.

The AI failure was persisted for refresh, and no unpaid test allocated inventory. These successes are useful boundaries but do not compensate for the failed economic, concurrency, recovery, or provider gates.

## Reproduction and retained artifacts

```powershell
npm run lint
npm run build
npx --no-install tsc --noEmit
npm run eval
npm run verify
npx --no-install tsx scripts/domain-regressions.mts
node scripts/live-tests.mjs --target=https://farmbroker-aii.vercel.app --env-file=.env.production.local
```

The live harness requires an explicit remote target; its default is localhost. Repeating it creates additional **named unpaid** requests and sandbox orders, so use a dedicated test deployment/workspace for routine automation. It does not reset inventory or fabricate payment evidence.

Machine-readable outputs and screenshots are saved in the workspace's sibling `pal/deployment-evidence/` directory:

- `2026-10-15-live-tests.json`: individual checks, failure responses, fixture IDs, timing, and blocked cases.
- `2026-10-15-domain-regressions.json`: six focused domain assertions.
- `2026-10-15-primary-capture.json`: application capture failure response.
- `2026-10-15-provider-and-rpc-diagnostics.json`: model availability/authentication and exact RPC failure.
- `2026-10-15-model-diagnostics.json`: primary 403 and fallback no-answer evidence.
- `live-tests-hub-empty-2026-10-15.png`: authenticated Hub queue behavior.

Six named unpaid requests were created by the harness. Test deals include the two unapproved payment attempts and the unpaid incident needed to reproduce the recovery bug. These records were retained for diagnosis. No stock was allocated to the tested unpaid deal, no supplier payouts were sent, and the primary order has no successful capture/refund.

Next full rehearsal should begin after the PayPal sandbox capture blocker, economic/quantity guards, payment-attempt race, schema mismatch, AI output configuration, and recovery guards/RPC are resolved. Then execute the paid happy/recovery/refund scenarios and financial replay/concurrency tests; they remain unverified today.
