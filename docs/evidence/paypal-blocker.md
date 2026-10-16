# PayPal sandbox blocker tracker (2.0 — resolve, never bypass)

- Status: six paid live scenarios unverified. A fresh browser-approved order reproduced `COMPLIANCE_VIOLATION` through the native webhook worker. The deal remains unpaid with zero allocations. A later lookup of this fresh order returned HTTP 500 `INTERNAL_SERVICE_ERROR`.
- Owner: founder (account/app holder). Next: PayPal support + dashboard compliance review.
- Evidence to collect: order IDs, `debug_id` values, account verification state, app scopes, currency configuration, support ticket refs.
- Fresh diagnostic: sandbox order `9H181097AE572525U`, native-verified approval event `WH-9WU33519RU836781T-3C151279E73271322`, received October 16 at 00:50:58 UTC. Durable job `9932009d-8cd5-4a9d-a64b-709c4236808a` reached review after one attempt with `PayPal capture: COMPLIANCE_VIOLATION`. The capture rejection's debug ID was not retained in the old job error; the hotfix preserves it for future rejections. The later lookup debug ID is `f53659532a3b3` and must not be described as the capture debug ID.
- Earlier original order `23M81863VE120800C` also returned lookup 500, debug ID `ca4b2c6444c8d`.
- Webhook registration and production `PAYPAL_WEBHOOK_ID` configuration are complete. One authentic approval event passed native verification. Native/postback comparison and the paid financial lifecycle remain separate proof gates.
- Rules: no fabricated capture, no mocked success in the release path, no alternative payment simulation passing the paid gate. Financial release stays blocked until actual capture + refund succeed.
- Code already records provider issue + debug ID on every rejection (`providerError` in `src/lib/paypal.ts`); e2e/smoke stop with `BLOCKED` notes instead of fake passes.

## Account-holder support packet

Ask PayPal Developer support to diagnose the sandbox application's `COMPLIANCE_VIOLATION` on capture of the fresh approved order above, and the subsequent Orders GET `INTERNAL_SERVICE_ERROR` with its distinct debug ID. Include the UTC event time and configured sandbox merchant/application identifiers through PayPal's support channel. The exact restriction is not known from this response. This packet has been prepared locally; no support message has been sent.

Once resolved, create a fresh isolated fixture, obtain a new AI decision and accept its bound quote, then approve that new sandbox order. The retained decision has expired. Verify canonical capture, bound procurement, 2T rejection, real AI recovery, replacement inspection, settlement and handover. Use a separate captured fixture for refund proof. Never retry with invented payment state or change the accepted contract to make a stale paid plan appear valid.

Sanitized observations: [live release evidence](live-release-2026-10-16.json).
