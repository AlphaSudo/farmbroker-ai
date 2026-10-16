# PayPal sandbox blocker tracker (2.0 — resolve, never bypass)

- Status: six paid live scenarios unverified. Earlier capture returned `COMPLIANCE_VIOLATION`; on October 16 the old order lookup returned HTTP 500 `INTERNAL_SERVICE_ERROR`. A fresh unapproved order lookup returned 200 `CREATED`, with zero captures.
- Owner: founder (account/app holder). Next: PayPal support + dashboard compliance review.
- Evidence to collect: order IDs, `debug_id` values, account verification state, app scopes, currency configuration, support ticket refs.
- Fresh diagnostic: original order `23M81863VE120800C`, lookup debug ID `ca4b2c6444c8d`. Latest unpaid test order lookup succeeded. Use a fresh isolated scenario for further browser approval; do not keep treating the old order as healthy.
- Webhook registration and production `PAYPAL_WEBHOOK_ID` configuration are complete. Authentic-event comparison and the live financial lifecycle remain separate proof gates.
- Rules: no fabricated capture, no mocked success in the release path, no alternative payment simulation passing the paid gate. Financial release stays blocked until actual capture + refund succeed.
- Code already records provider issue + debug ID on every rejection (`providerError` in `src/lib/paypal.ts`); e2e/smoke stop with `BLOCKED` notes instead of fake passes.
