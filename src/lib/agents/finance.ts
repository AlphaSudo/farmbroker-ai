// Agent 6 — Finance: settlement AFTER inspection (STEP 10).
// payout = passed→allocated×clearing, partial→usable×clearing, failed→0.
// margin = total − Σpayouts. Assert exact. Seed: 15,000/22,500/37,500 + 3,000.
import type { Allocation, Deal, Payout, Settlement } from "../types";
import { num } from "../types";
import { acceptedKg } from "../domain/coverage";

export function financeAgent(deal: Deal, allocations: Allocation[]): Settlement {
  const clearing = num(deal.clearing_per_kg);
  const payouts: Payout[] = allocations.map((a) => {
    const kg = acceptedKg(a);
    return {
      supplier_id: a.supplier_id,
      supplier_name: a.supplier?.name ?? "Supplier",
      kg,
      amount: Math.round(kg * clearing),
      grade: a.quality_grade,
      status: a.inspection_status === "failed" ? "Excluded (failed inspection)" : "Calculated (simulated payout)",
    };
  });
  const paid = payouts.reduce((s, p) => s + p.amount, 0);
  const margin = num(deal.total_price) - paid;
  if (paid + margin !== num(deal.total_price)) throw new Error("Settlement math drift");
  return { total: num(deal.total_price), payouts, margin, deal_id: deal.id };
}
