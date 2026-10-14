# Release evidence (1.8/1.9) — fill during rehearsals; no invented IDs

- Release commit: _TBD_ · tag: _TBD_ · migrations: 001 + 002–007 applied: _yes/no_ · deployment: https://farmbroker-aii.vercel.app
- Model config: primary `thinkingmachines/inkling:free`, fallback `nvidia/nemotron-3.5-lightning:free` (env-overridable).
- Fixtures: happy-path (3-supplier 78,000 math) · quality-recovery (reject 2T → backup) · refund-required (no backup).
- Checks: `npm run build` _exit_ · `npm run lint` _exit_ · `npm run eval` _n/n_ · smoke localhost _result_.
- Sandbox proof: capture ID _…_ (happy) · refund ID _…_ (refund fixture) · reconciled _yes/no_.
- Rehearsals: five consecutive scenario runs with IDs/timings: 1) _ 2) _ 3) _ 4) _ 5) _.
- Stranger review: product sells _…_; AI decided _…_; PayPal enabled _…_.
- Availability owner through Dec 15, 2026: _name_ · recovery: redeploy Vercel from `main`, re-run migrations/seed per judge-guide.
