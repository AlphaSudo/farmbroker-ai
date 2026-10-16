# Judge guide (1.9) — run the product without code knowledge

## Hosted rehearsal
1. Open https://farmbroker-aii.vercel.app (no login).
2. Click **Create Buyer Request** → fill 10,000 kg Mint, 7 days, max 9 → Submit.
3. **Run AI Analysis** → review the feasibility heuristic (92/100 in the locked fixture, not a success probability) → **AI plan** → start planning and wait for the stored model decision → create a bound quote and **Approve Pricing**.
4. **Pay with PayPal** using the sandbox buyer account from the Devpost testing notes → Payment Success.
5. **Watch AI Procurement** → native worker commits the stored bound plan. On Quality, unlock Hub inspection using the supplied test Hub key. Grade each lot or use **Approve All with Demo Values** for the happy path.
6. Complete **Settlement**, then record **simulated handover** from the order's Hub finance page. The receipt now shows completion. Supplier payouts are calculated only.

The minute scheduler executes one bounded job per tick. Callback, procurement and recovery jobs can require separate ticks; refresh reads state without driving the worker. Label waiting periods that are cut or accelerated in the video.

## What to try
- Recovery: in `/hub/orders`, **Create Recovery scenario**, then open its buyer order and complete planning, accepted quote and sandbox payment. On Quality, pass the 3T and 5T lots (full weight, moisture 10, visual score 5, Good), reject the 2T lot (full weight, moisture 25, visual score 5, Wet). The native worker selects and commits the pre-existing 2T standby; inspect that replacement before settlement and handover.
- No-backup refund: **Create Refund scenario** starts a separate isolated unpaid order with no backup. Pay it, pass 8T and reject 2T. Recovery marks the shortage refund-eligible; Hub finance requests the full sandbox refund. Accepted supplier obligations remain platform exposure after the refund.
- Negotiation: low offers are refused at the floor; valid counters become revisions you explicitly accept.

## Hub access (demo operations)
- Open `/hub/orders` → enter the **Hub key** from the Devpost testing notes → queue, finance (capture/refund/ledger/exposure), handover, reconcile.
- Sandbox = no real money. Supplier payouts are calculated/simulated. Amounts: 78,000 EGP ≈ 1,625.00 USD at the fixed demo rate 48.

## Local path
`npm install` → copy `.env.example` to `.env.local` (fill PayPal sandbox + Supabase + OpenRouter values) → `DATABASE_URL=... node scripts/migrate.mjs` to apply all ordered migrations → `npm run dev`. See [scheduler setup](runbook/scheduler.md) for native processing and [sandbox receiving setup](evidence/paypal-blocker.md) for the Egyptian test merchant. `npm run eval` runs the offline suite.

Verified on October 16: capture `4AX46377UJ2507235`, live AI recovery and simulated fulfillment; separate completed refund `9DK12347NS950124R`. See [paid journey evidence](evidence/paid-journey-2026-10-16.json).
