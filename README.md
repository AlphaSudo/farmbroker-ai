# FarmBroker AI — autonomous procurement platform (PayPal AI Hackathon 2026)

> FarmBroker AI is an autonomous procurement platform. A buyer submits a sourcing request. AI evaluates feasibility, prices the deal, collects payment, procures supply from multiple suppliers, manages quality control, settles suppliers, and delivers a completed supply chain transaction.

> "The buyer requested supply. The AI sourced it. The platform guaranteed it. PayPal secured the transaction."

We sell **Guaranteed Supply**: buyer asks for 10 Tons Mint, the platform handles everything. NOT a marketplace — buyers never see suppliers, suppliers never see buyers.

Next program: [2.0–2.9 architecture, performance, product, and evidence roadmap](docs/roadmap-2.0-2.9/README.md), based on the [expanded source review](docs/roadmap-2.0-2.9/source-review.md). Each iteration has an implementation plan and detailed checklist. The [1.1–1.9 roadmap](docs/roadmap/README.md) remains the earlier planning record.

**Release audit:** the 2.x code is present, but "fully implemented" exceeds the retained proof. October 16 now includes actual sandbox capture, bound procurement, rejection and live AI recovery, settlement, simulated handover, and a separate completed full refund. The hotfix also passes the production build, 30 offline evals, 10 domain regressions, 35 rolled-back database checks with explicit provider/model stubs, and 12 offline signature-mechanics checks. Declared load targets and other architecture gates remain pending. See [paid journey evidence](docs/evidence/paid-journey-2026-10-16.json) and the [v2.9 audit and remaining work](docs/evidence/v2.9-release-audit-2026-10-16.md).

## Run it

```bash
npm install
cp .env.example .env.local   # fill values (never commit)
# Apply supabase/migrations/* in numeric order (tracked in schema_migrations):
# DATABASE_URL=... node scripts/migrate.mjs   (fresh clones need only repo + DATABASE_URL)
npm run dev                  # http://localhost:3000
```

Env (see `.env.example`): `PAYPAL_CLIENT_ID/SECRET/MODE/CURRENCY`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY` (server-only), `AI_API_KEY/BASE_URL/MODEL_*`, `APP_URL`.

Seed demo: Ahmed 2000kg/7.0 + Mohamed 3000kg/7.5 + Ali 5000kg/7.3 Mint, buyer Cairo Foods 10000kg/7d. Full 100-row dataset: Hub → Load button (`POST /api/hub/import`) or `node scripts/import-suppliers.mjs`.

## Intended sandbox flow (Money-first, GR#3)

Request → AI Analysis (92 feasibility heuristic, not a success probability) → Quote 78,000 → Accept → **PayPal Sandbox** → Payment Success → AI Procurement 10/10 → Hub inspection (Grade A/B, `Risk = Supplier → Risk = Platform`, Insured) → Settlement (`Inspection Passed → Payment Released`, `Ready for PayPal Payout`) → Completed.

Locked demo math: floor 73,000 → clearing 7.5/kg → quote 7.8/kg → total **78,000**, pool 75,000, margin **3,000**, split **15,000 / 22,500 / 37,500**. PayPal charged in USD at fixed demo rate 48 EGP/USD (1,625.00 USD) — sandbox has no EGP. Verify: `npx tsx scripts/verify-math.mts` → `LOCKED-MATH-OK`.

## Architecture

Buyer lane (`/request/**`: aggregates only) vs Hub lane (`/hub/**`: internal ops). 6 agents in `src/lib/agents/`: Demand, Risk, Pricing, Procurement (paid-only, 403 otherwise), Quality (Approved/Partial/Rejected), Finance (PayPal + settlement + margin). API in `src/app/api/`. Details: `docs/` (system, user-flow, database-schema, agent, api, stories, pitch).

Sandbox test accounts (pattern, secrets stay in `.env.local`): business `sb-*@business.example.com` (payee = platform), personal `sb-*@personal.example.com` (buyer). No real money moves; supplier payouts are calculated, not sent (PayPal Payouts = post-hackathon).

## Tools used

- **PayPal Sandbox**: Orders v2 API and JS SDK buttons. Actual create/approval/capture and a separate completed full refund are verified. Native webhooks reconcile financial operations. No verified capture means no supplier commitment.
- **AI (OpenRouter)**: schema-validated plan selection and negotiation tooling. Primary `nvidia/nemotron-3.5-lightning:free`, compatible fallback `liquid/lfm-2.5-2.6b:free`; actual Liquid planning completed through the native scheduler with the scenario tab closed. A paid plan's stored hash matched its committed items; Nvidia selected the demonstrated 2T recovery. Existing unbound contracts retain manual provenance.

## Kill test (demonstrated checks)

- Without PayPal confirmation, no procurement commits (verified-paid gate, 403 otherwise).
- Without valid model output, new autonomous plan selection/recovery planning pauses. Bound contracts require their valid matching decision; deterministic reconciliation and explicitly labeled legacy manual operations remain available.

## Capability table

| Area | Status |
| --- | --- |
| AI plan selection | Actual provider decisions and paid 2T recovery verified; richer intent remains partial |
| PayPal Sandbox lifecycle | Two actual captures and one separate completed full refund verified |
| Atomic reservations, idempotent operations, event timeline | Matching paid plan hash and operation replays verified; larger contention/load proof pending |
| Supply/inspection/handover data, settlement math | Simulated + labeled |
| Supplier payouts | Calculated only (`Ready for PayPal Payout`), never sent |
| Real payouts, carriers, insurers, logistics | Future (out of scope) |

Full 1.1–1.9 program: `docs/roadmap/README.md` · evals: `npm run eval` · judge path: `docs/judge-guide.md` · submission: `docs/submission.md`.

## Submission

- Demo video (<3min, public YouTube): TODO_LINK
- Live demo: https://farmbroker-aii.vercel.app
- Sandbox capture proof: `4AX46377UJ2507235`; separate full refund proof: `9DK12347NS950124R`.
- License: MIT.
