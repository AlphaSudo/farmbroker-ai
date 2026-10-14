# API Architecture (Next.js Route Handlers, all JSON)

## Buyer

- `GET/POST /api/requests` — create + list buyer requests (validated: qty>0, 1–30d, price>0)
- `GET /api/requests/[id]` — request detail (name-blind)
- `POST /api/analyze` `{requestId}` — Demand+Risk → confidence payload
- `POST /api/quote` `{requestId}` — Pricing → quote (blocked if conf<60)
- `POST /api/deals` — persist approved quote (`quoted`)
- `GET /api/procure?dealId=` — coverage progress (refresh-safe)
- `POST /api/procure` `{dealId}` — run Procurement; **403 unless paid**
- `GET /api/settle?dealId=` / `POST /api/settle` `{dealId}` — compute/persist split; **403 unless quality complete**

## PayPal (server-only secrets)

- `POST /api/paypal/create-order` `{dealId}` — OAuth client_credentials → Orders v2 create, `purchase_units=[{amount:{currency_code:'USD'}, custom_id:dealId}]`, payee = platform business
- `POST /api/paypal/capture-order` `{orderID}` — capture → save `paypal_order_id/capture_id`, Deal→`paid`, Request→`paid`
- Capture-on-return is sufficient for MVP; webhooks → BACKLOG.

## Hub (internal)

- `GET/POST /api/hub/suppliers` (+ import endpoint for CSV), `POST /api/quality` `{allocationId, weight, moisture, score, condition}`, `POST /api/quality/approve-all` `{dealId}` (demo shortcut)

## Errors

`{error}` + status: 400 validation, 403 gate (unpaid / pre-inspection), 404 unknown id, 500 provider error (PayPal/AI) with user-safe message + logged IDs.

---
*Stack frozen: Next.js / Node.js / Supabase / AI best-free-key (OpenRouter) / PayPal Sandbox (USD) / Vercel. No changes later.*
