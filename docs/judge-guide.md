# Judge guide (1.9) — run the product without code knowledge

## Hosted path (2 min)
1. Open https://farmbroker-aii.vercel.app (no login).
2. Click **Create Buyer Request** → fill 10,000 kg Mint, 7 days, max 9 → Submit.
3. **Run AI Analysis** → 92% → **Approve & Get Quote** → **Approve Pricing**.
4. **Pay with PayPal** using the sandbox buyer account from the Devpost testing notes → Payment Success.
5. **Watch AI Procurement** → Supply Locked → Quality → **Approve All** (or grade manually) → **Settlement** → receipt.

## What to try
- Recovery: on the quality screen, grade one lot as failed (moisture 25) → run recovery from the order page flow → backup lot restores coverage. (Recovery endpoint: `POST /api/recovery {dealId}`.)
- No-backup refund: shortage with no eligible backup marks the order refund-eligible; Hub finance requests the sandbox refund.
- Negotiation: low offers are refused at the floor; valid counters become revisions you explicitly accept.

## Hub access (demo operations)
- Open `/hub/orders` → enter the **Hub key** from the Devpost testing notes → queue, finance (capture/refund/ledger/exposure), handover, reconcile.
- Sandbox = no real money. Supplier payouts are calculated/simulated. Amounts: 78,000 EGP ≈ 1,625.00 USD at the fixed demo rate 48.

## Local path
`npm install` → copy `.env.example` to `.env.local` (fill PayPal sandbox + Supabase + OpenRouter values) → run `supabase/migrations/001–007.sql` in Supabase SQL editor → `node scripts/migrate.mjs` → `npm run dev`. `npm run eval` for the offline suite.
