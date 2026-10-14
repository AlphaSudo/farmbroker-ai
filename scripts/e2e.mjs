// Live end-to-end test against production (or localhost with BASE override).
// Stops before PayPal capture (needs browser sandbox login) after proving create-order.
// Usage: node scripts/e2e.mjs [baseUrl]
const BASE = process.argv[2] ?? "https://farmbroker-aii.vercel.app";
let pass = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (cond) pass++; else process.exitCode = 1;
};
const post = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const get = async (path) => {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

// 1. Tables exist? (demo seed)
const sup = await get("/api/hub/suppliers?pool=demo");
check("demo suppliers seeded", sup.status === 200 && sup.data.suppliers?.length >= 3, `found ${sup.data.suppliers?.length ?? sup.status}`);
if (process.exitCode) { console.log("BLOCKED: run supabase/migrations/001_schema.sql in Supabase SQL editor first."); process.exit(1); }

// 2. Import 100-row dataset
const imp = await post("/api/hub/import", {});
check("import 100-row dataset", imp.status === 200 && imp.data.imported === 100, `imported ${imp.data.imported ?? imp.status}`);

// 3. Buyer creates request
const req = await post("/api/requests", { buyer_name: "E2E Test", crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9 });
check("create request", req.status === 201 && !!req.data.request?.id, req.data.request?.id ?? req.status);
const requestId = req.data.request?.id;

// 4. AI analysis → 92%
const an = await post("/api/analyze", { requestId });
check("analysis confidence 92%", an.data.analysis?.confidence === 92, `got ${an.data.analysis?.confidence}`);

// 5. Quote → 78,000
const q = await post("/api/quote", { requestId });
check("quote total 78,000", q.data.quote?.total === 78000, `got ${q.data.quote?.total}`);

// 6. Approve → deal quoted
const deal = await post("/api/deals", { requestId });
check("deal quoted", deal.status === 201 || deal.status === 200, deal.data.deal?.id ?? deal.status);
const dealId = deal.data.deal?.id;

// 7. GR#3 gate: procure BEFORE payment must 403
const pre = await post("/api/procure", { dealId });
check("procure blocked pre-payment (403)", pre.status === 403);

// 8. PayPal create-order (real sandbox order, proves credentials + integration)
const order = await post("/api/paypal/create-order", { dealId });
check("paypal create-order", order.status === 200 && !!order.data.orderId, order.data.orderId ?? JSON.stringify(order.data).slice(0, 120));

console.log(`\n${pass} checks passed. NEXT: approve the order in browser, then capture + procure → settle.`);
console.log(`Pay URL: ${BASE}/request/${requestId}/pay`);
console.log(`Order ID: ${order.data.orderId ?? "(none)"}`);
