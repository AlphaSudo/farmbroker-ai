# User Flow (buyer lane vs hub lane)

```mermaid
flowchart TD
  A[Buyer: create request<br/>10T Mint / 7d] --> B[AI Analysis<br/>Confidence 92%]
  B --> C[Quote 78,000 USD-equiv<br/>Qty+Price+Delivery]
  C -->|Accept| D[Pay with PayPal<br/>Payment Success]
  D -->|PAID-GATE<br/>403 if unpaid| E[AI Procurement<br/>A2T+B3T+C5T → 10/10]
  E --> F[Hub intake<br/>deliver to Collection Hub]
  F --> G[Inspection<br/>Qty/Quality/Condition/Moisture]
  G -->|INSPECTION-GATE<br/>blocked if pending| H[Settlement<br/>Passed→Released + margin]
  H --> I[Completed Order]
```

## Lanes

- **Buyer lane** (`/request`, `/quote`, `/pay`, buyer dashboards): aggregates only — Order Status, Confidence, Expected Delivery, Payment Status. ZERO supplier names/contacts. Sees `FarmBroker Supply Network`.
- **Hub lane** (`/hub/*`, internal ops): Supplier A/B/C tables, intake forms, inspection grading, import/reset. Never linked from buyer CTAs.

## Gates (executable constitution)

- PAID-GATE: `POST /api/procure` → 403 unless `deal.status === 'paid'` (GR#3 Money first).
- INSPECTION-GATE: `POST /api/settle` → 403 unless quality done on all allocations (STEP 10 after inspection only).

---
*Stack frozen: Next.js / Node.js / Supabase / AI best-free-key (OpenRouter) / PayPal Sandbox (USD) / Vercel. No changes later.*
