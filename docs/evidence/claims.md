# Claim ledger (2.8) — every presentation claim links to an artifact or is marked pending

| Claim | Artifact | Status |
| --- | --- | --- |
| AI plan selection binds committed items (hash receipt) | `012_decision_contracts.sql`, `/api/commands/execute`, `/api/evidence` | Implemented; live run pending |
| Atomic paid reservation, no oversell | `reserve_paid_plan` + `execute_bound_plan`, evals | Implemented; concurrency proof pending isolated DB |
| PayPal capture gates commitments; refund compensates | verify + attempts + refunds + webhook + reconcile | Implemented; live capture/refund blocked (`COMPLIANCE_VIOLATION`, see `evidence/paypal-blocker.md`) |
| Native webhook verification | `paypal-signature.ts` + [live release evidence](live-release-2026-10-16.json) | One authentic approval event verified; native/postback corpus comparison pending |
| Durable planning completes with browser closed | `commerce_jobs` + worker + wake + [live release evidence](live-release-2026-10-16.json) | Measured with a real model and native scheduler; restart/soak proof pending |
| Bounded SQL snapshots (256 rows, scalar totals) | `011_supply_snapshots.sql`, `perf/supply` probe | Implemented; S1 measurement pending |
| Minimal repair inside fixed buyer charge | recovery + policy v2 + entitlements + exposure | v1 recovery implemented; authoritative margin-funded v2 integration and live recovery proof pending |
| 30/30 offline invariants | `npm run eval` | Measured ✅ |
| Locked 78,000/75,000/3,000 fixture | `npm run verify` → `LOCKED-MATH-OK` | Measured ✅ |
| Buyer comprehension / audience benefit | `docs/discovery/observation-template.md` | Pending consented sessions |
| Video/submission | `docs/demo-script.md`, `docs/submission.md` | Pending user authorization |
