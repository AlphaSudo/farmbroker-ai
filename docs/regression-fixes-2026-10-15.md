# Regression corrections — October 15, 2026

This supersedes the failure status of the earlier baseline report for application defects. It does **not** claim a successful live PayPal capture or refund.

## Implemented checklist

- [x] Counteroffers cannot fall below the clearing floor. Quote creation, acceptance, and checkout independently check economics and supply. Clearing uses selected lots, rather than unrelated expensive stock.
- [x] Quote acceptance updates the revision, deal, request, and event in one transaction. An active checkout locks its contract. A replay returns the existing accepted deal.
- [x] Checkout claims a durable database attempt before calling PayPal. A partial unique index enforces one active attempt per deal. Concurrent callers reuse one provider order and one UUID request key. Unknown creation outcomes keep their original key and have a bounded retry window.
- [x] Capture checks completion, exact amount, USD, merchant, and deal binding before an atomic payment receipt. Retries look up provider truth first. Provider failures include a safe issue code and preserve unpaid state.
- [x] Usable weight is capped by received and allocated weight. Finance, recovery, progress, settlement, and handover use inspected accepted quantity. Payouts are labeled as simulated calculations.
- [x] Plans reject duplicate supplier lots, fractional/invalid quantities, below-floor rates, inconsistent totals, and budget violations. Stock reservations count all unreleased commitments, including finalized deals, and lock lots in stable order.
- [x] Recovery refuses unpaid orders and incomplete inspections before creating incidents. Incident creation and replacement commitment are transactional. Replacement reservation uses the actual request binding; incident, reservation, attempt, and event commit together. Rejected stock is quarantined. Attempt limits lead to refund eligibility.
- [x] Live AI uses a tested model/output configuration. Invalid/unavailable output pauses for retry and commits no stock. Runs have database-enforced leases and bounded attempts; persisted results omit supplier IDs from buyer responses.
- [x] Hub queue has a real deal timestamp and propagates query errors. Hub finance queries propagate errors as well.
- [x] Request creation returns only the ID and retains an HttpOnly guest cookie across requests. Deal mutation responses use the buyer serializer; buyer event/run/recovery responses omit internal lot identifiers.
- [x] Isolated happy-path, recovery, and refund fixtures can be created through Hub-only `POST /api/hub/fixtures`. Recovery has a pre-existing 2,000 kg standby lot; baseline remains 10,000 kg and 78,000 EGP. Fixture stock cannot inflate or satisfy another fixture.
- [x] Refund claims preserve one active operation per capture, including uncertain outcomes. Pending refunds do not create completed-refund ledger entries. Provider reconciliation and completion are atomic and replay-safe. Request status permits `refunded`.
- [x] Removed unconditional eval placeholders and added executable domain, database, and HTTP regressions.

Migrations `008`, `009`, and `010` were applied to the configured Supabase project. The old unpaid shortage incident is closed with an audit event; its history is retained. Duplicate unapproved local payment attempts are superseded without deleting provider order history or creating charges.

## Validation

| Layer | Result |
| --- | --- |
| Offline eval | 30 passed, no placeholder passes |
| Focused domain regressions | 6 passed, 0 failed |
| Database integration | 18 passed, 0 failed; transaction rolled back |
| Local HTTP/provider harness | 57 passed, 0 failed, 6 provider-blocked scenarios |
| TypeScript / ESLint / production build | Passed |
| Locked baseline arithmetic | 78,000 EGP total / 75,000 supplier entitlement / 3,000 gross spread preserved |
| Vercel production verification | **57 passed, 0 failed, 6 provider-blocked scenarios** on deployment `FCLLffwWPnBfPBLJPHRmR72Qt4jd` / code commit `6f9a8c6` |

Database integration tests use explicitly labeled provider stubs **inside one uncommitted transaction**, then roll everything back. They prove database guards and state transitions, including reject 2T → replace → inspect → settle → handover and pending → completed refund replay. They do not prove real provider payment or the full browser checkout callback.

The HTTP harness creates named unpaid requests, isolated scenarios, and unapproved sandbox orders. It checks live AI decisions and simultaneous checkout calls. No live order is marked paid by the tests.

## Remaining external gate

The originally approved PayPal Sandbox order returned `COMPLIANCE_VIOLATION` again after the fixes were deployed. The corrected application returned HTTP **422** with the provider issue, and the deal remained `quoted` with no capture ID or verified payment. Its actual capture/refund journey must pass before the hackathon financial demo is called ready. Application guards continue to require verified provider capture. `PAYPAL_WEBHOOK_ID` is intentionally unset until a webhook is registered; its route returns 503.

The Hub queue now provides **Create Happy path / Recovery / Refund scenario** controls. They create fresh, browser-owned unpaid requests using the tested fixture API, so the next payment rehearsal can start with the required backup stock already present.

Retained corrected-run evidence: `2026-10-15-production-fixed.json`, `2026-10-15-production-capture-fixed.json`, `2026-10-15-domain-regressions-fixed.json`, and `2026-10-15-database-regressions-fixed.json` in `pal/deployment-evidence/`. Earlier failure evidence is retained separately.

## Reproduction

Run from the application directory:

```powershell
npm run eval
npm run test:domain
npm run verify
npx --no-install tsc --noEmit
npm run lint
npm run build
node scripts/database-regressions.mjs --pooler=<project-pooler-host>
node scripts/live-tests.mjs --target=http://localhost:3100 --report=../deployment-evidence/local-fixed.json
node scripts/live-tests.mjs --target=https://farmbroker-aii.vercel.app --env-file=.env.production.local --report=../deployment-evidence/production-fixed.json
```

`DATABASE_URL` can replace the database test's pooler option. Credentials remain in ignored local files and are never included in reports. Remote HTTP testing is explicit; routine automation should use a dedicated test project. Baseline failure artifacts are preserved separately from corrected runs.
