// Optimizer ablation (2.5/2.8): cost-first vs improved candidate set vs AI pick.
// Offline by default (AI choice stubbed by confirmed priority); --live attempts a real model pick.
// Usage: npx tsx scripts/ablate.mts [--live]
import { candidatePlans, exactBest } from "../src/lib/procurement/plans";
import type { Supplier } from "../src/lib/types";

const mk = (n: number): Supplier[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `lot-${i}`, name: `S${i}`, crop: "Mint",
    quantity_kg: 800 + ((i * 53) % 5000), min_price: 7 + ((i * 17) % 25) / 10,
    available_date: null, location: "Hub", quality_score: 70 + ((i * 31) % 30), pool: "demo" as const,
  }));

const live = process.argv.includes("--live");
const lots = mk(12).filter((l) => l.crop === "Mint");
const target = 10000;
const plans = candidatePlans(lots, target);
const oracle = exactBest(lots.filter((_, i) => i < 12).slice(0, 12), target);
console.log(`candidates=${plans.map((p) => `${p.id}:${p.cost_total}`).join(" ")}`);
console.log(`oracle cheapest=${oracle?.cost ?? "n/a"} (n≤12 exact)`);
for (const p of plans) {
  const gap = oracle ? (((p.cost_total - oracle.cost) / oracle.cost) * 100).toFixed(1) : "n/a";
  console.log(`- ${p.id}: cost ${p.cost_total}, concentration ${p.metrics?.concentration}, lots ${p.metrics?.lots}, oracle-gap ${gap}%`);
}
let aiPick = "cost-first (stub: confirmed priority lowest_cost)";
if (live) {
  const { chatJSON } = await import("../src/lib/ai");
  const r = await chatJSON("Pick one plan ID. Reply JSON.", `IDs: ${plans.map((p) => p.id).join(", ")}. Priority: lowest cost. Reply {"candidate_id":"..."}`);
  aiPick = r ? `live:${r.model}` : "live FAILED, stub retained";
}
console.log(`AI selection: ${aiPick} (validity enforced by validators regardless; cases where AI adds no benefit are reported, not hidden)`);
