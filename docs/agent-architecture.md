# Agent Architecture (6 required + 2 preview)

| # | Agent | Input | Output | Guard |
|---|-------|-------|--------|-------|
| 1 | Demand | raw buyer text/form | `{"crop":"mint","quantity":"10 tons"}` structured | normalize ar/en crop names, kg units |
| 2 | Risk | structured request + suppliers | `{confidence, available_kg, risk_level, reasons[]}` | reasons carry NO supplier names to buyer |
| 3 | Pricing | mins + confidence | `{per_kg, total, cost, margin, market_range}` | conf<60 → not quotable; floor = max(mins)+margin |
| 4 | Procurement | paid Deal | allocations A2T+B3T+C5T, coverage | PAID-GATE: 403 unless `paid`; idempotent upsert |
| 5 | Quality | Hub form (weight/moisture/score/condition) | Grade A/B, `passed/partial/failed` | INSPECTION-GATE downstream; fail excluded from settle |
| 6 | Finance | Deal + passed/partial allocs | PayPal order/capture + `{payouts, margin}` | pre-inspection → 403; `sum+margins==total` assert |
| + | Negotiation (0.9) | buyer offer text | counter within floor | Buyer↔PLATFORM only; contact requests blocked |
| + | Export (0.9) | covered deal | English offer + mock buyer drafts | labeled vision preview |

## Cross-cutting rules

- Deterministic default for Demand/Risk/Pricing; `Regenerate with AI` calls OpenRouter (primary inkling, fallback nemotron), same schema + zod + 8s timeout + cache per requestId.
- Buyer-facing outputs are name-blind: aggregates + `FarmBroker Supply Network` only. Identities exist solely in Hub lane.
- Every agent logs 1-3 reasoning lines to the UI log panel (judges see agents working).

---
*Stack frozen: Next.js / Node.js / Supabase / AI best-free-key (OpenRouter) / PayPal Sandbox (USD) / Vercel. No changes later.*
