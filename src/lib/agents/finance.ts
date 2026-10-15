// Agent 6 — Finance: settlement AFTER inspection (STEP 10).
// v1-clearing (legacy fixture): payout = accepted kg × uniform clearing. Seed: 15,000/22,500/37,500 + 3,000.
// v2-entitlement: payout = accepted kg × allocation's immutable entitlement rate.
import type { Allocation, Deal, Payout, Settlement } from "../types";
import { num } from "../types";
import { acceptedKg } from "../domain/coverage";

export function financeAgent(deal: Deal, allocations: Allocation[], policy?: string): Settlement {
  const pol = policy ?? (deal as { pricing_policy?: string }).pricing_policy ?? "v1-clearing";
  const clearing = num(deal.clearing_per_kg);
  const payouts: Payout[] = allocations.map((a) => {
    const kg = acceptedKg(a);
    const rate = pol === "v2-entitlement"
      ? num((a as { entitlement_rate?: number }).entitlement_rate ?? (num(a.allocated_kg) > 0 ? num(a.cost) / num(a.allocated_kg) : clearing))
      : clearing;
    return {
      supplier_id: a.supplier_id,
      supplier_name: a.supplier?.name ?? "Supplier",
      kg,
      amount: Math.round(kg * rate),
      grade: a.quality_grade,
      status: a.inspection_status === "failed" ? "Excluded (failed inspection)" : "Calculated (simulated payout)",
    };
  });
  const paid = payouts.reduce((s, p) => s + p.amount, 0);
  const margin = num(deal.total_price) - paid;
  if (paid + margin !== num(deal.total_price)) throw new Error("Settlement math drift");
  return { total: num(deal.total_price), payouts, margin, deal_id: deal.id };
}
