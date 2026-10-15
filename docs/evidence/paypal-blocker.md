# PayPal sandbox blocker tracker (2.0 — resolve, never bypass)

- Status: capture returns `COMPLIANCE_VIOLATION`; six paid live scenarios unverified.
- Owner: founder (account/app holder). Next: PayPal support + dashboard compliance review.
- Evidence to collect: order IDs, `debug_id` values, account verification state, app scopes, currency configuration, support ticket refs.
- Rules: no fabricated capture, no mocked success in the release path, no alternative payment simulation passing the paid gate. Financial release stays blocked until actual capture + refund succeed.
- Code already records provider issue + debug ID on every rejection (`providerError` in `src/lib/paypal.ts`); e2e/smoke stop with `BLOCKED` notes instead of fake passes.
