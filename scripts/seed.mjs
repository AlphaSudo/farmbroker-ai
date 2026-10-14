// Seeds demo pool + full dataset + seed buyer via API. Localhost-first; remote needs --target.
// Hub endpoints use HUB_KEY from .env.local. Usage: node scripts/seed.mjs [--target=URL]
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const arg = process.argv.find((a) => a.startsWith("--target="));
const BASE = arg ? arg.split("=")[1] : "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
let HUB = "";
const envPath = join(here, "..", ".env.local");
if (existsSync(envPath)) HUB = (readFileSync(envPath, "utf8").match(/^HUB_KEY=(.+)$/m) ?? [])[1]?.trim() ?? "";
const hub = { "x-hub-key": HUB };
const post = async (path, body, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
for (const s of [
  { name: "Ahmed", crop: "Mint", quantity_kg: 2000, min_price: 7.0, location: "Menoufia", quality_score: 92 },
  { name: "Mohamed", crop: "Mint", quantity_kg: 3000, min_price: 7.5, location: "Menoufia", quality_score: 88 },
  { name: "Ali", crop: "Mint", quantity_kg: 5000, min_price: 7.3, location: "Giza", quality_score: 90 },
]) {
  const r = await post("/api/hub/suppliers", s, hub);
  console.log(r.status === 201 ? `PASS seed ${s.name}` : `FAIL seed ${s.name} — ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
  if (r.status !== 201) process.exitCode = 1;
}
const imp = await post("/api/hub/import", {}, hub);
console.log(imp.status === 200 ? `PASS import ${imp.data.imported}` : `FAIL import — ${imp.status}`);
if (imp.status !== 200) process.exitCode = 1;
const buyer = await post("/api/requests", { buyer_name: "Cairo Foods", crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9 });
console.log(buyer.status === 201 ? `PASS seed buyer ${buyer.data.request?.id}` : `FAIL buyer — ${buyer.status}`);
if (buyer.status !== 201) process.exitCode = 1;
