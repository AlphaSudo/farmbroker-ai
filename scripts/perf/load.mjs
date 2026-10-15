// Open-loop load probe (2.8): fixed arrival rate, bounded concurrency, honest accounting.
// Refuses production-like targets without --i-know. Mutations use isolated buyer names.
// Usage: node scripts/perf/load.mjs [--target=URL] [--rate=5] [--secs=60] [--i-know]
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.split("="); return [k.replace(/^--/, ""), v ?? "true"]; }));
const BASE = args.target ?? "http://localhost:3000";
if (/vercel\.app|onrender\.com|fly\.dev/.test(BASE) && args["i-know"] !== "true") {
  console.log("REFUSED: production-like target needs --i-know (isolated benchmark target required).");
  process.exit(2);
}
const RATE = Number(args.rate ?? 5);
const SECS = Number(args.secs ?? 60);
let jar = "";
const call = async (path, body) => {
  const t0 = performance.now();
  try {
    const r = await fetch(`${BASE}${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json", ...(jar ? { Cookie: jar } : {}) }, body: JSON.stringify(body) } : { headers: jar ? { Cookie: jar } : {} });
    const sc = r.headers.get("set-cookie");
    if (sc) { const m = sc.match(/fb_buyer=([^;]+)/); if (m) jar = `fb_buyer=${m[1]}`; }
    const ms = performance.now() - t0;
    return { ok: r.ok, status: r.status, ms };
  } catch (e) { return { ok: false, status: 0, ms: performance.now() - t0, err: String(e) }; }
};
const lat = [];
let attempted = 0, completed = 0, rejected = 0, failed = 0;
const tick = async () => {
  attempted++;
  const c = await call("/api/requests", { buyer_name: `Load-${Date.now().toString(36)}`, crop: "Mint", quantity_kg: 1000, delivery_days: 7, max_price: 9 });
  lat.push(c.ms);
  if (!c.ok) { (c.status === 422 || c.status === 403 ? rejected++ : failed++); return; }
  completed++;
};
const interval = 1000 / RATE;
const end = Date.now() + SECS * 1000;
const inFlight = new Set();
while (Date.now() < end) {
  const p = tick().finally(() => inFlight.delete(p));
  inFlight.add(p);
  if (inFlight.size >= RATE * 3) await Promise.race(inFlight);
  await new Promise((r) => setTimeout(r, interval));
}
await Promise.allSettled(inFlight);
lat.sort((a, b) => a - b);
const pct = (q) => (lat[Math.floor(q * (lat.length - 1))] ?? 0).toFixed(1);
console.log(JSON.stringify({ target: BASE, rate: RATE, secs: SECS, attempted, completed, rejected, failed, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) }));
console.log("note: request-creation mix only; reads/quotes/commands need fixture ids — see S-profiles in performance-contract.md.");
