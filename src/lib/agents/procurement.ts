// Agent 4 — Procurement: assemble supply ONLY for paid deals (GR#3).
// Cheapest-first greedy. Returns allocation rows (no DB writes here; route persists).
import type { BuyerRequest, Supplier } from "../types";
import { num } from "../types";

export interface PlannedAllocation { supplier_id: string; allocated_kg: number; cost: number; }

export function procurementAgent(
  request: Pick<BuyerRequest, "quantity_kg">,
  suppliers: Supplier[]
): { allocations: PlannedAllocation[]; covered_kg: number; covered: boolean } {
  const sorted = [...suppliers].sort((a, b) => num(a.min_price) - num(b.min_price));
  let need = request.quantity_kg;
  const allocations: PlannedAllocation[] = [];
  for (const s of sorted) {
    if (need <= 0) break;
    const take = Math.min(need, num(s.quantity_kg));
    if (take > 0) allocations.push({ supplier_id: s.id, allocated_kg: take, cost: Math.round(take * num(s.min_price)) });
    need -= take;
  }
  const covered_kg = request.quantity_kg - need;
  return { allocations, covered_kg, covered: need <= 0 };
}
