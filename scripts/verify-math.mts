// Dev-only math check for locked demo numbers. Run: npx tsx scripts/verify-math.mts
import { riskAgent } from "../src/lib/agents/risk";
import { pricingAgent } from "../src/lib/agents/pricing";
import { procurementAgent } from "../src/lib/agents/procurement";
import { qualityAgent } from "../src/lib/agents/quality";
import { financeAgent } from "../src/lib/agents/finance";
import type { Supplier } from "../src/lib/types";

const S: Supplier[] = [
  { id: "a", name: "Ahmed", crop: "Mint", quantity_kg: 2000, min_price: 7, available_date: new Date(Date.now() + 3 * 864e5).toISOString(), location: "Menoufia", quality_score: 92, pool: "demo" },
  { id: "b", name: "Mohamed", crop: "Mint", quantity_kg: 3000, min_price: 7.5, available_date: new Date(Date.now() + 3 * 864e5).toISOString(), location: "Menoufia", quality_score: 88, pool: "demo" },
  { id: "c", name: "Ali", crop: "Mint", quantity_kg: 5000, min_price: 7.3, available_date: new Date(Date.now() + 3 * 864e5).toISOString(), location: "Giza", quality_score: 90, pool: "demo" },
];
const R = { crop: "Mint", quantity_kg: 10000, delivery_days: 7 };
const an = riskAgent(R, S);
console.log("CONF", an.confidence, an.risk_level);
const q = pricingAgent(R, { confidence: an.confidence, quotable: an.quotable }, S);
console.log("QUOTE total/supplier_cost/margin/per_kg:", q.total, q.supplier_cost, q.margin, q.per_kg);
const p = procurementAgent(R, S);
console.log("PROC covered/covered?:", p.covered_kg, p.covered);
const D = { id: "d", request_id: "r", total_price: q.total, supplier_cost: q.supplier_cost, margin: q.margin, per_kg: q.per_kg, clearing_per_kg: q.clearing_per_kg, paypal_order_id: null, paypal_capture_id: null, status: "paid" };
const A = p.allocations.map((x) => {
  const s = S.find((y) => y.id === x.supplier_id)!;
  const g = qualityAgent({ allocated_kg: x.allocated_kg, weight_received_kg: x.allocated_kg, moisture_pct: 10, visual_score: 5, condition: "Good" });
  return { id: x.supplier_id, deal_id: "d", supplier_id: x.supplier_id, allocated_kg: x.allocated_kg, cost: x.cost, quality_grade: g.grade, inspection_status: g.decision, payout_status: "pending", weight_received_kg: x.allocated_kg, moisture_pct: 10, visual_score: 5, condition: "Good", usable_kg: g.usable_kg, supplier: s };
});
const st = financeAgent(D, A);
console.log("SETTLE total/payouts/margin:", st.total, st.payouts.map((x) => x.amount).join("/"), st.margin);
const set = [...st.payouts.map((x) => x.amount)].sort((a, b) => a - b).join(",");
const ok = an.confidence === 92 && q.total === 78000 && st.total === 78000 && set === "15000,22500,37500" && st.margin === 3000;
console.log(ok ? "LOCKED-MATH-OK" : "LOCKED-MATH-FAIL");
process.exit(ok ? 0 : 1);
