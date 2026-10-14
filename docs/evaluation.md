# Evaluation (1.8) — how to reproduce, what passed, what remains live-only

## Offline suite (no DB, no providers)

```bash
npm run eval    # 30/30 hard-invariant cases (evals/scenarios.json)
npm run verify  # locked demo math → LOCKED-MATH-OK
```

Covers: intent normalization/ambiguity, eligibility (short/late/wrong-crop/budget/empty/unknown-date/pool isolation/exact cover), inspection grades incl. no-show, hostile inputs (negative qty, invented candidates, unknown lots, buyer DTO leak scan), transitions, money rounding, refund-cap/quote-expiry policy points enforced in routes.

## Live suites (need DB + sandbox)

```bash
npm run smoke                          # localhost-first: reset → seed → 92% → 78,000 → floor holds → quoted → 403 pre-pay → sandbox order
node scripts/smoke.mjs --target=URL    # explicit remote only
node scripts/e2e.mjs --target=URL      # legacy journey checks (same guardrails)
```

Live-only evidence (per roadmap): real capture + reconciled refund, concurrent reserve proof, AI recovery selection. Record provider IDs + run IDs in `release-evidence.md`, never secrets.

## Baselines ( branches; fill after runs )
- eval: 30/30 offline (2026-10-14+).
- smoke localhost: PASS through create-order; capture needs browser approval.
- concurrency/provider runs: PENDING — see release-evidence.md.
