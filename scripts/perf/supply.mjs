// Offline supply-scale probe (2.1): in-memory candidate generation at 1k/10k/100k lots
// plus estimated RPC transfer bytes (256-row cap × ~90B). No DB/providers touched.
// Usage: npx tsx scripts/perf/supply.mjs
import { candidatePlans } from "../../src/lib/procurement/plans";

const mk = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `lot-${i}`, name: `S${i}`, crop: i % 10 === 0 ? "Basil" : "Mint",
    quantity_kg: 500 + ((i * 37) % 4000), min_price: 7 + ((i * 13) % 20) / 10,
    available_date: null, location: "Hub", quality_score: 70 + ((i * 29) % 30), pool: "demo",
  }));
const mint = (lots) => lots.filter((l) => l.crop === "Mint");

for (const n of [1001, 10000, 100000]) {
  const lots = mint(mk(n));
  const t0 = performance.now();
  const plans = candidatePlans(lots, 10000);
  const ms = performance.now() - t0;
  const bytes = Math.min(256, lots.length) * 90;
  console.log(`lots=${n} plans=${plans.length} ms=${ms.toFixed(1)} est_rpc_bytes~${bytes}`);
}
console.log("note: transfer bounded by 256-row cap; totals stay SQL scalars over all eligible lots.");
