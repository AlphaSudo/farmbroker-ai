// Candidate supply plans (1.4): cost-first + reliability-first over the ELIGIBLE set.
// Both validated identically; the model (1.2) selects an ID — never arithmetic.
import type { Supplier } from "../types";
import { num } from "../types";

export interface PlanItem { supplier_id: string; kg: number; rate: number; }
export interface PlanMetrics { concentration: number; avgQuality: number; lots: number; }
export interface Plan { id: "cost-first" | "reliability-first" | "diversity-first"; items: PlanItem[]; total_kg: number; cost_total: number; metrics?: PlanMetrics; }

const metricsFor = (items: PlanItem[], byId: Map<string, { quality: number }>, total: number): PlanMetrics => {
  const shares = items.map((i) => i.kg / total);
  const avgQ = items.reduce((s, i) => s + (byId.get(i.supplier_id)?.quality ?? 0) * i.kg, 0) / total;
  return { concentration: Math.max(...shares), avgQuality: Math.round(avgQ * 10) / 10, lots: items.length };
};

export function candidatePlans(eligible: Supplier[], targetKg: number): Plan[] {
  const byId = new Map(eligible.map((s) => [s.id, { quality: num(s.quality_score ?? 0) }]));
  const mk = (sorted: Supplier[], id: Plan["id"], capFirstShare = 1): Plan | null => {
    let left = targetKg;
    const items: PlanItem[] = [];
    for (const s of sorted) {
      if (left <= 0) break;
      const cap = items.length === 0 ? Math.ceil(targetKg * capFirstShare) : left;
      const take = Math.min(left, num(s.quantity_kg), cap);
      if (take <= 0) continue;
      items.push({ supplier_id: s.id, kg: take, rate: num(s.min_price) });
      left -= take;
    }
    if (left > 0) return null;
    const withMetrics: Plan = { id, items, total_kg: targetKg, cost_total: items.reduce((t, i) => t + i.kg * i.rate, 0) };
    withMetrics.metrics = metricsFor(items, byId, targetKg);
    return withMetrics;
  };
  const byCost = [...eligible].sort((a, b) => num(a.min_price) - num(b.min_price));
  const byRel = [...eligible].sort((a, b) => num(b.quality_score ?? 0) - num(a.quality_score ?? 0) || num(a.min_price) - num(b.min_price));
  const out = [mk(byCost, "cost-first"), mk(byRel, "reliability-first")];
  if (eligible.length >= 2) out.push(mk(byRel, "diversity-first", 0.5));
  const seen = new Set<string>();
  return out.filter((p): p is Plan => {
    if (!p) return false;
    const k = p.items.map((i) => `${i.supplier_id}:${i.kg}`).join("|");
    if (seen.has(k)) return false; // dedupe identical item sets (2.5)
    seen.add(k);
    return true;
  }).map((p) => improve(p, eligible, targetKg));
};

// Bounded improvement pass: pairwise tail swaps toward cheaper unused lots (2.5).
function improve(plan: Plan, eligible: Supplier[], targetKg: number): Plan {
  const used = new Map(plan.items.map((i) => [i.supplier_id, i.kg]));
  let improved = true, guard = 0;
  const items = plan.items.map((i) => ({ ...i }));
  while (improved && guard++ < 4) {
    improved = false;
    for (const cand of [...eligible].sort((a, b) => num(a.min_price) - num(b.min_price))) {
      if (used.has(cand.id)) continue;
      for (const it of items) {
        if (it.rate <= num(cand.min_price)) continue;
        const move = Math.min(it.kg, num(cand.quantity_kg));
        if (move <= 0) continue;
        it.kg -= move;
        const ex = items.find((x) => x.supplier_id === cand.id);
        if (ex) ex.kg += move; else items.push({ supplier_id: cand.id, kg: move, rate: num(cand.min_price) });
        used.set(cand.id, (used.get(cand.id) ?? 0) + move);
        improved = true;
        break;
      }
      if (improved) break;
    }
    for (let i = items.length - 1; i >= 0; i--) if (items[i].kg <= 0) items.splice(i, 1);
  }
  const cost = items.reduce((t, i) => t + i.kg * i.rate, 0);
  const byId = new Map(eligible.map((s) => [s.id, { quality: num(s.quality_score ?? 0) }]));
  return { ...plan, items, cost_total: cost, metrics: metricsFor(items, byId, targetKg) };
}

// Exact small-instance oracle (2.5/2.8): brute-force cheapest feasible subset, n ≤ 16.
export function exactBest(eligible: Supplier[], targetKg: number): { cost: number; mask: number } | null {
  if (eligible.length > 16) throw new Error("oracle bounded to n ≤ 16");
  let best: { cost: number; mask: number } | null = null;
  for (let mask = 1; mask < 1 << eligible.length; mask++) {
    let kg = 0, cost = 0;
    const sorted = eligible.filter((_, i) => mask & (1 << i)).sort((a, b) => num(a.min_price) - num(b.min_price));
    for (const s of sorted) {
      if (kg >= targetKg) break;
      const take = Math.min(targetKg - kg, num(s.quantity_kg));
      kg += take; cost += take * num(s.min_price);
    }
    if (kg === targetKg && (!best || cost < best.cost)) best = { cost, mask };
  }
  return best;
}

export function validatePlan(plan: Plan, eligible: Supplier[], targetKg: number, maxTotal: number): string[] {
  const errors: string[] = [];
  const ids = new Set(eligible.map((s) => s.id));
  const seen = new Set<string>();
  let kg = 0, cost = 0;
  for (const i of plan.items) {
    const s = eligible.find((x) => x.id === i.supplier_id);
    if (!s) { errors.push(`unknown lot ${i.supplier_id.slice(0, 8)}`); continue; }
    if (!ids.has(i.supplier_id)) errors.push("ineligible lot");
    if (seen.has(i.supplier_id)) errors.push("duplicate supplier lot");
    seen.add(i.supplier_id);
    if (!Number.isSafeInteger(i.kg) || i.kg <= 0 || i.kg > num(s.quantity_kg)) errors.push(`quantity out of bounds for ${s.name}`);
    if (!Number.isFinite(i.rate) || i.rate <= 0 || i.rate < num(s.min_price)) errors.push(`rate below floor for ${s.name}`);
    kg += i.kg; cost += i.kg * i.rate;
  }
  if (kg !== targetKg) errors.push(`covers ${kg}, target ${targetKg}`);
  if (!Number.isFinite(cost) || cost > maxTotal) errors.push(`cost ${cost} over budget ${maxTotal}`);
  if (plan.total_kg !== kg || Math.abs(plan.cost_total - cost) > 0.001) errors.push("declared plan totals do not match items");
  return errors;
}
