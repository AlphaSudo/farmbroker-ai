// Candidate supply plans (1.4): cost-first + reliability-first over the ELIGIBLE set.
// Both validated identically; the model (1.2) selects an ID — never arithmetic.
import type { Supplier } from "../types";
import { num } from "../types";

export interface PlanItem { supplier_id: string; kg: number; rate: number; }
export interface Plan { id: "cost-first" | "reliability-first"; items: PlanItem[]; total_kg: number; cost_total: number; }

export function candidatePlans(eligible: Supplier[], targetKg: number): Plan[] {
  const mk = (sorted: Supplier[], id: Plan["id"]): Plan | null => {
    let left = targetKg;
    const items: PlanItem[] = [];
    for (const s of sorted) {
      if (left <= 0) break;
      const take = Math.min(left, num(s.quantity_kg));
      items.push({ supplier_id: s.id, kg: take, rate: num(s.min_price) });
      left -= take;
    }
    if (left > 0) return null;
    return { id, items, total_kg: targetKg, cost_total: items.reduce((t, i) => t + i.kg * i.rate, 0) };
  };
  const byCost = [...eligible].sort((a, b) => num(a.min_price) - num(b.min_price));
  const byRel = [...eligible].sort((a, b) => num(b.quality_score ?? 0) - num(a.quality_score ?? 0) || num(a.min_price) - num(b.min_price));
  return [mk(byCost, "cost-first"), mk(byRel, "reliability-first")].filter((p): p is Plan => !!p);
}

export function validatePlan(plan: Plan, eligible: Supplier[], targetKg: number, maxTotal: number): string[] {
  const errors: string[] = [];
  const ids = new Set(eligible.map((s) => s.id));
  let kg = 0, cost = 0;
  for (const i of plan.items) {
    const s = eligible.find((x) => x.id === i.supplier_id);
    if (!s) { errors.push(`unknown lot ${i.supplier_id.slice(0, 8)}`); continue; }
    if (!ids.has(i.supplier_id)) errors.push("ineligible lot");
    if (i.kg <= 0 || i.kg > num(s.quantity_kg)) errors.push(`quantity out of bounds for ${s.name}`);
    kg += i.kg; cost += i.kg * i.rate;
  }
  if (kg !== targetKg) errors.push(`covers ${kg}, target ${targetKg}`);
  if (cost > maxTotal) errors.push(`cost ${cost} over budget ${maxTotal}`);
  return errors;
}
