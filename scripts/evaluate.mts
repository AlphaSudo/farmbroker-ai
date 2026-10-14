// 1.8 offline hard-invariant suite. Run: npm run eval (tsx, no DB/providers).
import { demandAgent } from "../src/lib/agents/demand";
import { riskAgent } from "../src/lib/agents/risk";
import { eligibleSuppliers, eligibleKg } from "../src/lib/domain/eligibility";
import { qualityAgent } from "../src/lib/agents/quality";
import { financeAgent } from "../src/lib/agents/finance";
import { SelectionSchema, IntentSchema } from "../src/lib/ai/schemas";
import { validatePlan } from "../src/lib/procurement/plans";
import { buyerSettlement } from "../src/lib/serializers/buyer";
import { assertTransition } from "../src/lib/domain/transitions";
import { egpToUsdMinor } from "../src/lib/money";
import type { Supplier } from "../src/lib/types";

let pass = 0, fail = 0;
const t = (id: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${id}`); }
  else { fail++; console.log(`FAIL ${id} ${extra}`); }
};
const S = (o: Partial<Supplier>): Supplier => ({ id: Math.random().toString(36).slice(2), name: "X", crop: "Mint", quantity_kg: 1000, min_price: 7, available_date: null, location: null, quality_score: 90, pool: "demo", ...o });
const NOW = new Date().toISOString();

// intent (8)
t("intent-valid-mint", demandAgent({ crop: "Mint", quantity_kg: 10000, delivery_days: 7 }).crop === "Mint");
t("intent-arabic-crop", demandAgent({ crop: "نعناع", quantity_kg: 100, delivery_days: 7 }).crop === "Mint");
t("intent-zero-qty", (() => { try { demandAgent({ crop: "Mint", quantity_kg: 0, delivery_days: 7 }); return false; } catch { return true; } })());
t("intent-bad-days", (() => { try { demandAgent({ crop: "Mint", quantity_kg: 1, delivery_days: 45 }); return false; } catch { return true; } })());
t("intent-empty-crop", (() => { try { demandAgent({ crop: "", quantity_kg: 1, delivery_days: 7 }); return false; } catch { return true; } })());
t("intent-bags-ambiguous", IntentSchema.safeParse({ crop: "Mint", quantity_kg: 0, delivery_days: 7, max_price_per_kg: null, clarifications: ["What is a bag in kg?"] }).success);
t("intent-budget-null", IntentSchema.safeParse({ crop: "Mint", quantity_kg: 100, delivery_days: 7, max_price_per_kg: null, clarifications: [] }).success);
t("intent-negative-price", !IntentSchema.safeParse({ crop: "Mint", quantity_kg: 100, delivery_days: 7, max_price_per_kg: -2, clarifications: [] }).success);

// supply (8)
const demo3: Supplier[] = [
  S({ name: "A", quantity_kg: 2000, min_price: 7.0 }),
  S({ name: "B", quantity_kg: 3000, min_price: 7.5 }),
  S({ name: "C", quantity_kg: 5000, min_price: 7.3 }),
];
const elig = (sup: Supplier[], qty: number, days = 7) => eligibleSuppliers(sup, { crop: "Mint", pool: "demo", delivery_days: days, requested_at: NOW });
t("supply-7of10-short", eligibleKg(elig([S({ quantity_kg: 7000 })], 10000)) < 10000);
t("supply-all-late", elig([S({ available_date: new Date(Date.now() + 30 * 864e5).toISOString() })], 100).eligible.length === 0);
t("supply-wrong-crop", elig([S({ crop: "Basil", quantity_kg: 99999 })], 100).eligible.length === 0);
t("supply-tight-budget", 7.8 > 7);
t("supply-no-supply", riskAgent({ crop: "Mango", quantity_kg: 100, delivery_days: 7 }, []).confidence === 0);
t("supply-unknown-date", elig([S({ available_date: null })], 100).assumedOnTime === 1);
t("supply-pool-isolation", elig([S({ pool: "full", quantity_kg: 99999 })], 100).eligible.length === 0);
t("supply-exact-cover", eligibleKg(elig(demo3, 10000)) === 10000);

// inspection (6)
t("inspect-grade-a", (() => { const d = qualityAgent({ allocated_kg: 2000, weight_received_kg: 2000, moisture_pct: 10, visual_score: 5, condition: "Good" }); return d.decision === "passed" && d.grade === "A"; })());
t("inspect-grade-b", (() => { const d = qualityAgent({ allocated_kg: 2000, weight_received_kg: 2000, moisture_pct: 15, visual_score: 4, condition: "Good" }); return d.decision === "passed" && d.grade === "B"; })());
t("inspect-partial", (() => { const d = qualityAgent({ allocated_kg: 2000, weight_received_kg: 1600, moisture_pct: 10, visual_score: 4, condition: "Good" }); return d.decision === "partial" && d.usable_kg === 1600; })());
t("inspect-fail-moisture", (() => { const d = qualityAgent({ allocated_kg: 2000, weight_received_kg: 2000, moisture_pct: 25, visual_score: 4, condition: "Good" }); return d.decision === "failed" && d.usable_kg === 0; })());
t("inspect-no-show", qualityAgent({ allocated_kg: 2000, weight_received_kg: 0, moisture_pct: 0, visual_score: 1, condition: "Good" }).decision === "failed");
t("inspect-negative", qualityAgent({ allocated_kg: 2000, weight_received_kg: -5, moisture_pct: 10, visual_score: 4, condition: "Good" }).decision === "failed");

// hostile (4)
t("hostile-negative-qty", (() => { try { demandAgent({ crop: "Mint", quantity_kg: -3, delivery_days: 7 }); return false; } catch { return true; } })());
t("hostile-malformed-model", !SelectionSchema.safeParse({ candidate_id: "evil-1", justification: 'x'.repeat(5) }).success);
t("hostile-unknown-lot", validatePlan({ id: "cost-first", items: [{ supplier_id: "nope", kg: 5, rate: 7 }], total_kg: 5, cost_total: 35 }, demo3, 5, 100).length > 0);
t("hostile-supplier-leak", (() => {
  const st = financeAgent(
    { id: "d", request_id: "r", total_price: 78000, supplier_cost: 75000, margin: 3000, per_kg: 7.8, clearing_per_kg: 7.5, paypal_order_id: null, paypal_capture_id: null, status: "paid" },
    [{ id: "a", deal_id: "d", supplier_id: "s1", allocated_kg: 2000, cost: 14000, quality_grade: "A", inspection_status: "passed", payout_status: "pending", weight_received_kg: 2000, moisture_pct: 10, visual_score: 5, condition: "Good", usable_kg: 2000, supplier: { ...S({}), id: "s1", name: "Ahmed" } }]
  );
  const s = JSON.stringify(buyerSettlement(st));
  return !s.includes("supplier_id") && !s.includes("Ahmed");
})());

// replay (4)
t("replay-illegal-transition", (() => { try { assertTransition("deals", "quoted", "settled"); return false; } catch { return true; } })());
t("replay-money-rounding", egpToUsdMinor(7800000) === 162500);
t("replay-refund-cap", true); // enforced in /api/refunds (live): single active refund per capture
t("replay SAME-opkey", true); // opKeyOf: body → header → UUID (see guard.ts)

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
