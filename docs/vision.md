# Vision (P1 — VERBATIM, never paraphrase)

> FarmBroker AI is NOT a marketplace. Buyers never interact with suppliers. Suppliers never interact with buyers. A buyer submits a procurement request. AI evaluates feasibility and pricing. The buyer pays through PayPal. Only after payment, AI procures supply from multiple suppliers. Suppliers deliver to a FarmBroker collection hub. Quality inspection occurs. Suppliers get paid after inspection. Ownership transfers to FarmBroker. FarmBroker assumes post-inspection risk. The project demonstrates autonomous procurement and agentic commerce.

## MVP Scope (P3 — VERBATIM)

NO: Real logistics, Real insurance, Real warehouses, Real supplier payments, Real agriculture integrations.

YES: Simulated procurement, Simulated quality checks, Real AI, Real PayPal Sandbox, Real dashboards.

Hackathon MVP, not a real company. Simulated bits are labeled in UI.

## Narratives (P9 — both VERBATIM)

- Operational: "The buyer requested supply. The AI sourced it. The platform guaranteed it. PayPal secured the transaction."
- Pitch: "FarmBroker AI transforms fragmented agricultural supply into guaranteed fulfillment. Buyers purchase outcomes. AI handles sourcing, quality, supplier coordination, and financial settlement. PayPal secures the transaction."

## Kill Test (P10)

- PayPal removed → breaks? YES (no pay → no procure → no settle; `/api/procure` 403s when unpaid).
- AI removed → breaks? YES (no feasibility score, price, allocation, grade, split).
- Working prototype, never a mockup (real Sandbox capture ID required in README by 1.0).

---
*Stack frozen: Next.js / Node.js / Supabase / AI best-free-key (OpenRouter) / PayPal Sandbox (USD) / Vercel. No changes later.*
