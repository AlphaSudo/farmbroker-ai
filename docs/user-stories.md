# User Stories (step-by-step)

## Buyer Journey (Cairo Foods)

1. Opens landing, reads Guaranteed Supply + narrative, clicks Create Buyer Request.
2. Submits: Mint, 10000kg, 7 days, max 9/kg → sees Order Status `open`.
3. Runs AI Analysis → sees Confidence 92%, Expected Delivery 7d, reasons (no supplier names) → approves.
4. Sees Quote (Qty 10T, Price 78,000, Delivery 7d) → clicks Accept → Pay with PayPal → sandbox login → Payment Success → status `paid`.
5. Watches Procurement: Target/Covered/Remaining/Count → Fully Covered (network label only).
6. Sees Quality summary: 10T Insured; Finance: Buyer Payment + margin math; status → Completed.
7. Downloads receipt with capture ID. Never sees a supplier name. *Kill test: PayPal gone → stuck at Quote (YES breaks); AI gone → no score/price (YES breaks).*

## Supplier Journey (Ahmed, Hub lane)

1. Registered with crop/qty/min-price/date/location/score (by ops/import).
2. Receives allocation notice: deliver 2000kg Mint to FarmBroker Collection Hub by date (no buyer info).
3. Delivers to Hub; intake records weight/moisture/score/condition.
4. Sees `Inspection Passed, Grade A` → `Payment Released (calculated, Ready for PayPal Payout)`.
5. Never sees buyer identity. *Kill test: YES/YES (allocation needs paid deal + AI; payout needs inspection).*

## AI Journey

Parse → score feasibility → price with floor → wait for payment → allocate paid-only → grade inspections → split + margin. Every step logs reasoning; LLM improves wording, guards stay deterministic.

## Admin/Hub Journey

1. Imports `suppliers.csv` / resets 3-row demo seed. 2. Monitors 4 dashboards (Buyer/Procurement/Quality/Finance widgets). 3. Runs intake + approve-all shortcut for video. 4. Verifies buyer views name-clean via `?view=buyer` + View Source. *Kill test: YES/YES.*

---
*Stack frozen: Next.js / Node.js / Supabase / AI best-free-key (OpenRouter) / PayPal Sandbox (USD) / Vercel. No changes later.*
