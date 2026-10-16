# PayPal sandbox blocker tracker (2.0 — resolve, never bypass)

- Status: **resolved for the demonstrated sandbox journeys** on October 16. The existing Egyptian sandbox merchant had no automatic-transfer destination selected. Its existing test Visa was selected; PayPal confirmed the setting. With the same app credentials, merchant, buyer, USD amount and endpoints, two fresh checkouts then captured successfully and a separate full refund completed.
- Missing setup: automatic transfers on the merchant's sandbox wallet. The existing Visa and USD balance were already present; no client ID, secret, webhook, merchant email, country or application code change was needed for the successful capture.
- Current proof: recovery order `4MH338451M954000A`, capture `4AX46377UJ2507235`; separate refund order `0VG6468303965313H`, capture `81C97101FM686593F`, completed refund `9DK12347NS950124R` for USD 1,625.00. Direct provider GETs confirmed the capture/refund states. See [paid journey evidence](paid-journey-2026-10-16.json).
- Evidence to collect: order IDs, `debug_id` values, account verification state, app scopes, currency configuration, support ticket refs.
- Fresh diagnostic: sandbox order `9H181097AE572525U`, native-verified approval event `WH-9WU33519RU836781T-3C151279E73271322`, received October 16 at 00:50:58 UTC. Durable job `9932009d-8cd5-4a9d-a64b-709c4236808a` reached review after one attempt with `PayPal capture: COMPLIANCE_VIOLATION`. The capture rejection's debug ID was not retained in the old job error; the hotfix preserves it for future rejections. The later lookup debug ID is `f53659532a3b3` and must not be described as the capture debug ID.
- Earlier original order `23M81863VE120800C` also returned lookup 500, debug ID `ca4b2c6444c8d`.
- Webhook registration and production `PAYPAL_WEBHOOK_ID` configuration are complete. One authentic approval event passed native verification. Native/postback comparison and the paid financial lifecycle remain separate proof gates.
- Rules: no fabricated capture, no mocked success in the release path, no alternative payment simulation passing the paid gate. Financial release stays blocked until actual capture + refund succeed.
- Code already records provider issue + debug ID on every rejection (`providerError` in `src/lib/paypal.ts`); e2e/smoke stop with `BLOCKED` notes instead of fake passes.

The previous application message "sandbox account requires PayPal review" was an over-specific interpretation of the generic rejection code, not a provider finding that the account was restricted. It has been replaced with a neutral transaction-declined message. The merchant dashboard showed no receiving limit. Failed historical orders/events remain retained; the successful proof uses fresh bound decisions and checkouts.

## Reproduce the receiving setup

Sign in to the **sandbox merchant**, then open Account settings > Money, banks and cards > its existing test Visa > Automatic transfers > Update. Select the existing sandbox Visa and save. The successful screen says automatic transfers are set up, and the card subsequently displays Yes. This changes only the virtual sandbox account.

PayPal documents its [Receive Funds and Automatic Transfer agreement](https://pep.paypal.com/pw/legalhub/paypal/recpymt-full?country.x=PW&locale.x=en_PW), which includes Egypt, and the use of [fictitious sandbox accounts](https://developer.paypal.com/sandbox-testing/overview). The observed before/after result establishes the operational fix for this test pair; it does not diagnose every possible `COMPLIANCE_VIOLATION`.

## Account-holder support packet

If the rejection recurs after the receiving setup is confirmed, give PayPal Developer support the new order, UTC time and capture debug ID. The older lookup debug IDs below are distinct from capture errors. This historical packet was prepared locally; no support message was sent.

The fresh recovery run verified canonical capture, bound procurement, 2T rejection, real AI replacement, replacement inspection, settlement and simulated handover. A separate captured fixture verified a completed full refund. Capture, inspection, settlement, handover and refund replays reused existing operations. Supplier payouts and physical inspection/handover remain simulated.

Sanitized observations: [live release evidence](live-release-2026-10-16.json).
