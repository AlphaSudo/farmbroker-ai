# FarmBroker AI — autonomous procurement platform (PayPal AI Hackathon 2026)

> FarmBroker AI is an autonomous procurement platform. A buyer submits a sourcing request. AI evaluates feasibility, prices the deal, collects payment, procures supply from multiple suppliers, manages quality control, settles suppliers, and delivers a completed supply chain transaction.

> "The buyer requested supply. The AI sourced it. The platform guaranteed it. PayPal secured the transaction."

We sell **Guaranteed Supply**: buyer asks for 10 Tons Mint, the platform handles everything. NOT a marketplace — buyers never see suppliers, suppliers never see buyers.

Proposed next iterations: [1.1-1.9 roadmap and implementation checklists](docs/roadmap/README.md), grounded in the [October 14 source review](docs/roadmap/project-review.md). The review distinguishes implemented behavior from unverified or incomplete MVP claims below.

## Run it

```bash
npm install
cp .env.example .env.local   # fill values (never commit)
node scripts/migrate.mjs     # creates tables + demo seed (or paste supabase/migrations/001_schema.sql in Supabase SQL editor)
npm run dev                  # http://localhost:3000
```

Env (see `.env.example`): `PAYPAL_CLIENT_ID/SECRET/MODE/CURRENCY`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SECRET_KEY` (server-only), `AI_API_KEY/BASE_URL/MODEL_*`, `APP_URL`.

Seed demo: Ahmed 2000kg/7.0 + Mohamed 3000kg/7.5 + Ali 5000kg/7.3 Mint, buyer Cairo Foods 10000kg/7d. Full 100-row dataset: Hub → Load button (`POST /api/hub/import`) or `node scripts/import-suppliers.mjs`.

## Flow (Money-first, GR#3)

Request → AI Analysis (92%) → Quote 78,000 → Accept → **PayPal Sandbox** → Payment Success → AI Procurement 10/10 → Hub inspection (Grade A/B, `Risk = Supplier → Risk = Platform`, Insured) → Settlement (`Inspection Passed → Payment Released`, `Ready for PayPal Payout`) → Completed.

Locked demo math: floor 73,000 → clearing 7.5/kg → quote 7.8/kg → total **78,000**, pool 75,000, margin **3,000**, split **15,000 / 22,500 / 37,500**. PayPal charged in USD at fixed demo rate 48 EGP/USD (1,625.00 USD) — sandbox has no EGP. Verify: `npx tsx scripts/verify-math.mts` → `LOCKED-MATH-OK`.

## Architecture

Buyer lane (`/request/**`: aggregates only) vs Hub lane (`/hub/**`: internal ops). 6 agents in `src/lib/agents/`: Demand, Risk, Pricing, Procurement (paid-only, 403 otherwise), Quality (Approved/Partial/Rejected), Finance (PayPal + settlement + margin). API in `src/app/api/`. Details: `docs/` (system, user-flow, database-schema, agent, api, stories, pitch).

Sandbox test accounts (pattern, secrets stay in `.env.local`): business `sb-*@business.example.com` (payee = platform), personal `sb-*@personal.example.com` (buyer). No real money moves; supplier payouts are calculated, not sent (PayPal Payouts = post-hackathon).

## Tools used

- **PayPal Sandbox**: Orders v2 API (Create → Approve → Capture) + JS SDK buttons. Central: no payment → no procurement → no deal.
- **AI (OpenRouter, free tier)**: primary `thinkingmachines/inkling:free`, fallback `nvidia/nemotron-3.5-lightning:free` — negotiation chat + regenerable analysis, same JSON schema as deterministic core with 8s timeout. Remove AI → no score/price/allocation/grade/split.

## Kill test (demonstrated checks)

- Without PayPal confirmation, no procurement commits (verified-paid gate, 403 otherwise).
- Without a valid AI decision, no new autonomous plan selection/recovery proceeds (runs stay paused; deterministic reads and explicitly labeled manual ops remain available).

## Capability table

| Area | Status |
| --- | --- |
| Live AI plan/intent/recovery selection (OpenRouter free tier, validated) | Live |
| PayPal Sandbox create/approve/capture/verify/reconcile + full refund | Live (sandbox) |
| Atomic paid reservations, idempotent operations, event timeline | Live |
| Supply/inspection/handover data, settlement math | Simulated + labeled |
| Supplier payouts | Calculated only (`Ready for PayPal Payout`), never sent |
| Real payouts, carriers, insurers, logistics | Future (out of scope) |

Full 1.1–1.9 program: `docs/roadmap/README.md` · evals: `npm run eval` · judge path: `docs/judge-guide.md` · submission: `docs/submission.md`.

## Submission

- Demo video (<3min, public YouTube): TODO_LINK
- Live demo: https://farmbroker-aii.vercel.app
- Last sandbox capture ID (proof): TODO_CAPTURE_ID
- License: MIT.
