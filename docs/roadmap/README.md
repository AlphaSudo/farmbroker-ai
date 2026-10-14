# FarmBroker AI: iterations 1.1-1.9

Planning date: October 14, 2026. Status: proposed, not implemented. Baseline reviewed: `c16a286` in `farmbroker-ai`. Application paths below are relative to that repository. This roadmap extends the original 0.1-1.0 plan; it does not certify that every original acceptance item shipped.

**Recommendation: make FarmBroker an accountable procurement operator that can recover a broken deal.** The winning demonstration should be a paid order, a failed inspection, an AI-selected replacement, verified fulfillment, and reconciled money. More agent names or more preview screens will not provide the same evidence.

Read [the project review](project-review.md) first. Every iteration below has an implementation sequence, file targets, checklist, acceptance scenarios, and a scope cut.

## Identity to preserve

FarmBroker AI is an autonomous procurement platform. The buyer buys an outcome from FarmBroker; FarmBroker coordinates the supplier network and owns the transaction.

- Buyers never contact or browse suppliers. Suppliers never discover or contact buyers.
- Before payment, analysis may inspect availability and simulate candidate plans. Supplier commitments, reservations, allocations, and procurement happen only after a verified PayPal capture.
- Suppliers deliver to the FarmBroker collection hub. Inspection determines accepted quantity and supplier entitlement. Acceptance transfers responsibility to the platform in the simulation.
- The platform cannot call an order fulfilled when the accepted quantity is short. Refunding an unfulfilled order is a resolved exception, not a fulfilled order.
- Keep Next.js, Node.js, Supabase, the configurable AI provider, PayPal Sandbox, and Vercel. Add small libraries only when justified; do not add an agent framework, queue service, or alternate hosting platform for this plan.
- Logistics, hub operations, insurance, and supplier payouts stay simulated and visibly labeled. Real API interactions here mean actual AI calls and actual PayPal **sandbox** operations.

Retain the founder's operational narrative verbatim:

> The buyer requested supply. The AI sourced it. The platform guaranteed it. PayPal secured the transaction.

Retain the vision narrative verbatim:

> FarmBroker AI transforms fragmented agricultural supply into guaranteed fulfillment. Buyers purchase outcomes. AI handles sourcing, quality, supplier coordination, and financial settlement. PayPal secures the transaction.

Treat “Guaranteed Supply” as the product promise demonstrated through a fulfillment-or-refund policy. Do not imply real insurance, PayPal escrow, PayPal underwriting of delivery, or a deployed agricultural operation. Qualify the legacy narrative with an adjacent sandbox/simulation explanation.

## What judges need to see

The official rubric gives equal weight to technical execution, product design, credible impact, originality, and presentation. This plan deliberately serves all five; it is our strategy, not an organizer-endorsed recipe. [Official rubric](https://paypalaihackathon.devpost.com/rules)

| Judging dimension | Evidence we should produce | Main iterations |
| --- | --- | --- |
| Technical execution | Validated AI decisions, real sandbox capture/refund, duplicate-safe state changes | 1.1, 1.2, 1.5, 1.8 |
| Product design | Coherent buyer journey and separate Hub workspace, understandable exception states | 1.3, 1.7 |
| Credible impact | Specific herb-procurement audience, user observations, measured task outcomes | Start discovery in 1.1; consolidate in 1.8 |
| Originality | AI preserves a paid supply commitment after an inspection failure | 1.4, 1.6 |
| Presentation | A reproducible, comprehensible story with working evidence | 1.7, 1.9 |

Primary positioning: Best Use of Agentic Commerce and Best Use of PayPal + AI; overall prizes remain the broader objective. These are positioning choices, not predictions of winning. Sponsor integrations are optional under the [event requirements](https://paypalaihackathon.devpost.com/); do not divert effort into prize-specific integrations that weaken the procurement story.

## Sequence, effort, and calendar

Assumption: one developer, roughly 4-6 focused hours per day, with continuous small checks. Estimates include implementation and milestone verification, exclude waiting for user interviews/provider approvals, and are planning ranges rather than commitments.

| Version | Outcome | Target window, Cairo dates | Focused effort | Dependency |
| --- | --- | --- | --- | --- |
| [1.1](1.1-transaction-truth-and-boundaries.md) | Correct transaction rules, access boundaries, honest baseline | Oct 14-16 | 14-18 h | Current source |
| [1.2](1.2-grounded-ai-orchestration.md) | Real AI selects validated actions with a durable record | Oct 17-19 | 12-16 h | 1.1 |
| [1.3](1.3-buyer-intent-and-quote-contracts.md) | Natural-language intent becomes an accepted, immutable quote | Oct 20-21 | 8-12 h | 1.1-1.2 |
| [1.4](1.4-supply-planning-and-reservations.md) | Constrained supply plans and atomic paid reservations | Oct 22-24 | 12-16 h | 1.1-1.3 |
| [1.5](1.5-paypal-lifecycle-and-reconciliation.md) | Verified payment events, retry-safe capture/refund, ledger | Oct 25-27 | 12-16 h | 1.1, 1.3; 1.4 integration |
| [1.6](1.6-quality-recovery-and-guarantee.md) | Failed supply triggers recovery or a policy-controlled refund | Oct 28-30 | 12-16 h | 1.2, 1.4, 1.5 |
| [1.7](1.7-buyer-and-hub-product-experience.md) | A complete product that makes the deal understandable | Oct 31-Nov 2 | 12-16 h | 1.1-1.6 |
| [1.8](1.8-evaluation-impact-and-release-proof.md) | Measured reliability, AI usefulness, and audience evidence | Nov 3-5 | 10-14 h | 1.1-1.7 |
| [1.9](1.9-demo-freeze-and-submission.md) | Frozen release, video, judge instructions, submission package | Nov 6-9 | 10-14 h | 1.8 gate |

Total: 102-138 focused hours. Reserve Nov 10-12 for defects, provider issues, final checks, and submission. Freeze feature work by Nov 6; the 1.9 window is packaging and release repair only. Aim to submit by Nov 11, 18:00 Cairo.

The official deadline is Nov 12, 2026, 12:00 Pacific Standard Time, equivalent to 20:00 UTC / 22:00 Cairo. The rules list judging through Dec 15; keep the demo usable through that date, with a documented owner for availability. Recheck the organizer page before submission. [Official dates and access requirements](https://paypalaihackathon.devpost.com/rules)

The dependency order is intentional: do not build an autonomous recovery loop before it has valid payment, inventory, and quote boundaries. Product sketches and audience research can start early, but application implementation follows the gates.

## The demonstration to build toward

1. A food processor asks for 10,000 kg Mint within seven days with a budget.
2. AI normalizes the request, queries supply facts, compares valid plans, and explains the quote. Rules reject infeasible or over-budget plans.
3. The buyer explicitly accepts the quote and pays via PayPal Sandbox. A verified capture starts procurement.
4. Initial allocation covers 10,000 kg. A simulated Hub inspection rejects one 2,000 kg lot.
5. The order changes to **Recovering: 8,000 / 10,000 kg accepted**. AI chooses an eligible 2,000 kg backup within the original contract and budget.
6. The backup is reserved, delivered in the simulation, and inspected. Only then does accepted coverage return to 10,000 kg.
7. Supplier entitlements are calculated, platform responsibility is recorded, and the buyer sees the fulfilled receipt and PayPal reference. Supplier payouts remain simulated.
8. A separate exception fixture demonstrates no replacement available: completion stays blocked and a real sandbox refund is requested and reconciled.

Use three isolated fixtures: `happy-path` (the legacy 3-supplier math), `quality-recovery` (adds an explicitly simulated standby lot), and `refund-required` (no feasible backup). Never quietly change inventory or payment status to make a run succeed.

## Architecture decisions for all nine iterations

- **AI proposes and selects; code validates and executes.** Models interpret buyer intent and choose among grounded plans/recovery actions. Code owns arithmetic, authorization, quantity conservation, payment verification, and transaction state.
- Retain six domain responsibilities, but one small orchestrator can call their tools. Six separate model conversations are unnecessary.
- Persist quote revisions, policy versions, run steps, inspections, reservations, and money operations. A UI animation is not a business event.
- Use Postgres transactions/RPC functions for multirow domain mutations. Remote provider calls occur outside DB locks and reconcile through operation IDs plus durable results; there is no distributed transaction with PayPal.
- Work within Vercel request limits. A bounded `advance` call handles one run step; browser polling/resume drives the hackathon runner. A run survives refresh, but unattended continuous execution is not claimed without a separately verified scheduler. No fire-and-forget promises after returning a response.
- Persist scenario and supplier-pool selection on the request. Do not depend on query strings surviving navigation.
- Show model provenance as **Live AI**, **Recorded example**, or **Manual/rules-assisted mode**. An offline example may explain a past decision but cannot silently impersonate a live model or unlock a new autonomous procurement/refund.
- Protect Hub actions on the server. A query parameter or a hidden button never establishes a role.
- Store amounts in minor units with currency tags; retain the fixed demo FX snapshot, disclose it, and distinguish gross spread from net profit. Refund liabilities and rejected quantity never become extra profit.

The legacy “AI removed = everything breaks” wording overstates the current implementation. Replace it with two demonstrated dependency checks: without PayPal confirmation no procurement commits; without a valid AI decision no **new autonomous** plan selection/recovery proceeds. Deterministic calculations, safe reads, and explicitly labeled manual operations can remain available. Update the older architecture and pitch documents when the relevant implementation lands.

## Capacity cuts and decision gates

Every iteration marks optional work. If progress slips by more than two days, immediately choose its minimum scope; do not carry every feature forward unfinished.

The minimum competitive release contains: hard transaction/access guards; one live AI plan selection; paid reservation with quantity protection; verified PayPal capture plus refund recovery; one rejected-lot recovery scenario; clear buyer/Hub views; a reproducible release and video. Keep 1.8 and 1.9 even when other scope shrinks.

Cut first, in order: export preview polish; open-ended negotiation; second-language input; advanced diversification scoring; visual extras; analytics beyond evidence needed in the demo. Never cut capture verification, no-shortage-completion, privacy boundaries, or the final rehearsal.

Do not add real supplier payouts, logistics providers, insurance integrations, cross-border trade, weather/disease advice, supplier-buyer messaging, a public supplier catalog, or multiple sponsor tools in this cycle.

## Working agreement and milestone completion

Before implementing each iteration, explain its invariant, the files to change, and the first failure scenario to verify. During work, share decisions and concrete findings so implementation remains a software-engineering conversation.

- [ ] Entry gate: previous dependencies pass, implementation scope selected, current demo still runnable.
- [ ] Implement the smallest complete scenario, including failure handling and persistence.
- [ ] Run the stage's behavioral checks and normal lint/type/build checks as appropriate.
- [ ] Update the relevant architecture/API/schema/pitch documents; remove claims that no longer match behavior.
- [ ] Record one screenshot or short browser clip plus command results and fixture ID.
- [ ] Mark checklist items complete only with evidence; checkpoint the working version in Git.
- [ ] Perform PayPal/AI dependency checks and buyer/Hub data-boundary checks.
- [ ] Move to the next version only after its exit gate passes, or record an explicit scope reduction.

These documents are in `farmbroker-ai/docs/roadmap/` so the plans can be versioned with the application. The sibling `pal/plans/` folder contains the original plan and a pointer to this extension.
