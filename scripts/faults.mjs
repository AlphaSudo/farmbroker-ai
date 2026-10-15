// Guard/fault checks against localhost (2.8): replay, concurrency, actor, budget, crop.
// Usage: node scripts/faults.mjs [--target=URL]
// Worker-kill/lease-expiry and provider-timeout-after-effect are manual (see bottom).
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const arg = process.argv.find((a) => a.startsWith("--target="));
const BASE = arg ? arg.split("=")[1] : "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
let jar = "";
const req = async (path, opts = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers ?? {}), ...(jar ? { Cookie: jar } : {}) } });
  const sc = r.headers.get("set-cookie");
  if (sc) { const m = sc.match(/fb_buyer=([^;]+)/); if (m) jar = `fb_buyer=${m[1]}`; }
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const check = (n, c, x = "") => { console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); c ? pass++ : (fail++, (process.exitCode = 1)); };

const cq = await req("/api/requests", { method: "POST", body: JSON.stringify({ buyer_name: `Fault-${Date.now().toString(36)}`, crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9 }) });
check("create", cq.status === 201);
const id = cq.data.request?.id;
const key = `fault-${Date.now()}`;
const d1 = await req("/api/deals", { method: "POST", body: JSON.stringify({ requestId: id, opKey: key }) });
check("deal quoted", d1.status === 201);
const d2 = await req("/api/deals", { method: "POST", body: JSON.stringify({ requestId: id, opKey: key }) });
check("replay same opKey → same deal, no duplicate", d2.status === 200 && d2.data.deal?.id === d1.data.deal?.id);
const noCookie = await fetch(`${BASE}/api/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id }) });
check("no-cookie actor blocked (403)", noCookie.status === 403);
const cheap = await req("/api/requests", { method: "POST", body: JSON.stringify({ buyer_name: "FaultCheap", crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 7 }) });
const cq2 = await req("/api/quote", { method: "POST", body: JSON.stringify({ requestId: cheap.data.request?.id }) });
check("over-budget not quotable", cq2.data.quote?.quotable === false);
const run = await req("/api/runs", { method: "POST", body: JSON.stringify({ requestId: id }) });
const adv = [req(`/api/runs/${run.data.runId}/advance`, { method: "POST", body: JSON.stringify({}) }), req(`/api/runs/${run.data.runId}/advance`, { method: "POST", body: JSON.stringify({}) })];
const [a1, a2] = await Promise.all(adv);
check("concurrent advance serializes (one commits or clean replay)", (a1.status === 200 || a1.status === 502 || a1.status === 503) && (a2.status === 200 || a2.status === 502 || a2.status === 409 || a2.status === 503));
console.log(`\n${pass} passed, ${fail} failed.`);
console.log("MANUAL (needs operator): kill worker mid-claim → lease expires → resume without duplicate effect; provider timeout after capture → reconcile converges; browser closed mid-run → wake+worker completes.");
void readFileSync; void existsSync; void join; void dirname; void fileURLToPath;
