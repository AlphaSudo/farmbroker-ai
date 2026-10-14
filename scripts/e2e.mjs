// End-to-end against localhost by default; remote needs explicit --target=URL.
// Stops before PayPal capture (browser sandbox login) after proving create-order.
// Usage: node scripts/e2e.mjs [--target=URL]
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const arg = process.argv.find((a) => a.startsWith("--target="));
const BASE = arg ? arg.split("=")[1] : "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
let HUB = "";
const envPath = join(here, "..", ".env.local");
if (existsSync(envPath)) HUB = (readFileSync(envPath, "utf8").match(/^HUB_KEY=(.+)$/m) ?? [])[1]?.trim() ?? "";
let jar = "";
const post = async (path, body, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers, ...(jar ? { Cookie: jar } : {}) }, body: JSON.stringify(body ?? {}) });
  const sc = r.headers.get("set-cookie");
  if (sc) { const m = sc.match(/fb_buyer=([^;]+)/); if (m) jar = `fb_buyer=${m[1]}`; }
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const get = async (path, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, { headers: { ...(jar ? { Cookie: jar } : {}), ...headers } });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
let pass = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (cond) pass++; else process.exitCode = 1;
};
const hub = { "x-hub-key": HUB };
const sup = await get("/api/hub/suppliers?pool=demo", hub);
check("demo suppliers seeded", sup.status === 200 && sup.data.suppliers?.length >= 3, `found ${sup.data.suppliers?.length ?? sup.status}`);
if (process.exitCode) { console.log("BLOCKED: Hub key or seed missing. Run node scripts/seed.mjs first."); process.exit(1); }
const imp = await post("/api/hub/import", {}, hub);
check("import 100-row dataset", imp.status === 200 && imp.data.imported === 100, `imported ${imp.data.imported ?? imp.status}`);
const req = await post("/api/requests", { buyer_name: "E2E Test", crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9 });
check("create request", req.status === 201 && !!req.data.request?.id, req.data.request?.id ?? req.status);
const requestId = req.data.request?.id;
const an = await post("/api/analyze", { requestId });
check("analysis confidence 92%", an.data.analysis?.confidence === 92, `got ${an.data.analysis?.confidence}`);
const q = await post("/api/quote", { requestId });
check("quote total 78,000", q.data.quote?.total === 78000, `got ${q.data.quote?.total}`);
const deal = await post("/api/deals", { requestId });
check("deal quoted", deal.status === 201 || deal.status === 200, deal.data.deal?.id ?? deal.status);
const dealId = deal.data.deal?.id;
const pre = await post("/api/procure", { dealId });
check("procure blocked pre-payment (403)", pre.status === 403);
const order = await post("/api/paypal/create-order", { dealId });
check("paypal create-order", order.status === 200 && !!order.data.orderId, order.data.orderId ?? JSON.stringify(order.data).slice(0, 120));
console.log(`\n${pass} checks passed. NEXT: approve the order in browser, then capture + procure → settle.`);
console.log(`Pay URL: ${BASE}/request/${requestId}/pay`);
console.log(`Order ID: ${order.data.orderId ?? "(none)"}`);
