// 1.8 smoke: localhost-first mutation flow. Remote only with explicit --target=URL.
// Never defaults to production. Capture still needs browser approval (reports order URL).
// Usage: node scripts/smoke.mjs [--target=http://localhost:3000]
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const arg = process.argv.find((a) => a.startsWith("--target="));
const BASE = arg ? arg.split("=")[1] : "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
let HUB = process.env.HUB_KEY ?? "";
if (!HUB) {
  const envPath = join(here, "..", ".env.local");
  if (existsSync(envPath)) HUB = (readFileSync(envPath, "utf8").match(/^HUB_KEY=(.+)$/m) ?? [])[1]?.trim() ?? "";
}
let jar = "";
const req = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers ?? {}), ...(jar ? { Cookie: jar } : {}) } });
  const sc = r.headers.get("set-cookie");
  if (sc) { const m = sc.match(/fb_buyer=([^;]+)/); if (m) jar = `fb_buyer=${m[1]}`; }
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const check = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); if (c) pass++; else { fail++; process.exitCode = 1; } };

const hub = { "x-hub-key": HUB };
const imp = await req("/api/hub/import", { method: "POST", headers: hub });
check("import 100", imp.status === 200 && imp.data.imported === 100);
const tag = `Smoke-${Date.now().toString(36)}`;
const cq = await req("/api/requests", { method: "POST", body: JSON.stringify({ buyer_name: tag, crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9 }) });
check("create", cq.status === 201);
const id = cq.data.request?.id;
const an = await req("/api/analyze", { method: "POST", body: JSON.stringify({ requestId: id }) });
check("confidence 92", an.data.analysis?.confidence === 92, `got ${an.data.analysis?.confidence}`);
const q = await req("/api/quote", { method: "POST", body: JSON.stringify({ requestId: id }) });
check("quote 78000", q.data.quote?.total === 78000);
const neg = await req("/api/negotiate", { method: "POST", body: JSON.stringify({ requestId: id, message: "Can you do 1?" }) });
check("floor holds vs 1 EGP", neg.status === 200 && /floor/i.test(neg.data.reply ?? ""));
const deal = await req("/api/deals", { method: "POST", body: JSON.stringify({ requestId: id }) });
check("deal quoted", deal.status === 201);
const pre = await req("/api/procure", { method: "POST", body: JSON.stringify({ dealId: deal.data.deal?.id }) });
check("procure 403 pre-pay", pre.status === 403);
const order = await req("/api/paypal/create-order", { method: "POST", body: JSON.stringify({ dealId: deal.data.deal?.id }) });
check("sandbox order created", order.status === 200 && !!order.data.orderId, order.data.orderId ?? order.status);
console.log(`\n${pass} passed, ${fail} failed. Approve at ${BASE}/request/${id}/pay to continue (browser).`);
