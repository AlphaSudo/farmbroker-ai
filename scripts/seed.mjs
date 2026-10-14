// Seeds demo pool + full dataset + seed buyer via the live API (no DB password needed).
// Usage: node scripts/seed.mjs [baseUrl]
const BASE = process.argv[2] ?? "https://farmbroker-aii.vercel.app";
const post = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
for (const s of [
  { name: "Ahmed", crop: "Mint", quantity_kg: 2000, min_price: 7.0, location: "Menoufia", quality_score: 92 },
  { name: "Mohamed", crop: "Mint", quantity_kg: 3000, min_price: 7.5, location: "Menoufia", quality_score: 88 },
  { name: "Ali", crop: "Mint", quantity_kg: 5000, min_price: 7.3, location: "Giza", quality_score: 90 },
]) {
  const r = await post("/api/hub/suppliers", s);
  console.log(r.status === 201 ? `PASS seed ${s.name}` : `FAIL seed ${s.name} — ${r.status} ${JSON.stringify(r.data).slice(0, 100)}`);
  if (r.status !== 201) process.exitCode = 1;
}
const imp = await post("/api/hub/import", {});
console.log(imp.status === 200 ? `PASS import ${imp.data.imported}` : `FAIL import — ${imp.status}`);
if (imp.status !== 200) process.exitCode = 1;
const buyer = await post("/api/requests", { buyer_name: "Cairo Foods", crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9 });
console.log(buyer.status === 201 ? `PASS seed buyer ${buyer.data.request?.id}` : `FAIL buyer — ${buyer.status}`);
if (buyer.status !== 201) process.exitCode = 1;
