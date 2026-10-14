// Focused behavioral regressions missing from the existing happy-path eval suite.
import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { qualityAgent } from "../src/lib/agents/quality";
import { financeAgent } from "../src/lib/agents/finance";
import { validatePlan } from "../src/lib/procurement/plans";
import type { Supplier, Deal, Allocation } from "../src/lib/types";

const results: Array<{ name: string; status: string; reason?: string }> = [];
function test(name: string, run: () => void) {
  try { run(); results.push({ name, status: "pass" }); console.log(`PASS ${name}`); }
  catch (e) { const reason = e instanceof Error ? e.message : String(e); results.push({ name, status: "fail", reason }); console.log(`FAIL ${name}: ${reason}`); }
}
const supplier: Supplier = { id: "s", name: "Synthetic test lot", crop: "Mint", quantity_kg: 1000, min_price: 7.5, available_date: null, location: null, quality_score: 90, pool: "demo" };
const inspection = (weight: number) => qualityAgent({ allocated_kg: 1000, weight_received_kg: weight, moisture_pct: 10, visual_score: 5, condition: "Good" });
test("Inspection cannot accept more than allocated quantity", () => assert.ok(inspection(2000).usable_kg <= 1000));
test("Settlement pays actual accepted weight for a passed short lot", () => {
  const q = inspection(950);
  const allocation: Allocation = { id: "a", deal_id: "d", supplier_id: "s", allocated_kg: 1000, cost: 7500, quality_grade: q.grade, inspection_status: q.decision, payout_status: "pending", weight_received_kg: 950, usable_kg: q.usable_kg, moisture_pct: 10, visual_score: 5, condition: "Good", supplier };
  const deal: Deal = { id: "d", request_id: "r", total_price: 7800, supplier_cost: 7500, margin: 300, per_kg: 7.8, clearing_per_kg: 7.5, paypal_order_id: null, paypal_capture_id: null, status: "procuring" };
  assert.equal(financeAgent(deal, [allocation]).payouts[0].kg, 950);
});
test("Plan validation rejects a payout rate below the supplier floor", () => {
  const errors = validatePlan({ id: "cost-first", items: [{ supplier_id: "s", kg: 1000, rate: 0 }], total_kg: 1000, cost_total: 0 }, [supplier], 1000, 7800);
  assert.ok(errors.length > 0, "zero rate was accepted for a 7.5 EGP/kg supplier");
});
test("Plan validation totals duplicate supplier allocations against inventory", () => {
  const errors = validatePlan({ id: "cost-first", items: [{ supplier_id: "s", kg: 1000, rate: 7.5 }, { supplier_id: "s", kg: 1000, rate: 7.5 }], total_kg: 2000, cost_total: 15000 }, [supplier], 2000, 16000);
  assert.ok(errors.length > 0, "one 1000kg lot was accepted twice for 2000kg");
});
test("Normal fully received lot still passes quality", () => assert.equal(inspection(1000).decision, "passed"));
test("Failed inspection contributes zero accepted quantity", () => assert.equal(qualityAgent({ allocated_kg: 1000, weight_received_kg: 1000, moisture_pct: 25, visual_score: 5, condition: "Good" }).usable_kg, 0));
const output = resolve(process.argv.find(a => a.startsWith("--report="))?.slice(9) ?? "../deployment-evidence/2026-10-15-domain-regressions-fixed.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ tests: results, pass: results.filter(t => t.status === "pass").length, fail: results.filter(t => t.status === "fail").length }, null, 2) + "\n");
process.exitCode = results.some(r => r.status === "fail") ? 1 : 0;
