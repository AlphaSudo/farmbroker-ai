// S0 baseline timing (2.0): offline domain-function measurements + environment record.
// API/DB/provider timings need an isolated target; this script never touches providers.
// Usage: npx tsx scripts/benchmark-baseline.mts  →  docs/evidence/baseline/s0.md
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { riskAgent } from "../src/lib/agents/risk";
import { pricingAgent } from "../src/lib/agents/pricing";
import { candidatePlans } from "../src/lib/procurement/plans";
import type { Supplier } from "../src/lib/types";

const mk = (n: number): Supplier[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `lot-${i}`, name: `S${i}`, crop: i % 10 === 0 ? "Basil" : "Mint",
    quantity_kg: 500 + ((i * 37) % 4000), min_price: 7 + ((i * 13) % 20) / 10,
    available_date: null, location: "Hub", quality_score: 70 + ((i * 29) % 30), pool: "demo" as const,
  }));

const timed = <T,>(label: string, fn: () => T): { label: string; ms: number } => {
  const t0 = performance.now();
  fn();
  return { label, ms: performance.now() - t0 };
};
const R = { crop: "Mint", quantity_kg: 10000, delivery_days: 7 };

const rows: Array<{ label: string; ms: number }> = [];
for (const n of [3, 1001, 10000, 100000]) {
  const lots = mk(n);
  const mint = lots.filter((l) => l.crop === "Mint");
  rows.push(timed(`risk/scan-${n}`, () => riskAgent(R, mint)));
  rows.push(timed(`candidates/scan-${n}`, () => candidatePlans(mint, 10000)));
}
const q = pricingAgent(R, { confidence: 92, quotable: true }, mk(3).filter((l) => l.crop === "Mint"));
rows.push(timed("pricing/quote", () => pricingAgent(R, { confidence: 92, quotable: true }, mk(3).filter((l) => l.crop === "Mint"))));
void q;

const md = `# S0 baseline (offline domain functions)\n\nDate: ${new Date().toISOString()} · node ${process.version} · commit: see release-manifest\n\n| operation | ms |\n|---|---|\n${rows.map((r) => `| ${r.label} | ${r.ms.toFixed(1)} |`).join("\n")}\n\nNotes: in-memory only; no DB/network/provider. API p95, SQL EXPLAIN, queue wait, and provider latencies require the isolated S1 target (see performance-contract.md). Cold/warm split not yet measured.\n`;
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "evidence", "baseline");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "s0.md"), md);
console.log(md);
