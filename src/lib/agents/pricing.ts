// Agent 3 — Pricing: guaranteed quote. LOCKED demo math (documented, frozen):
// min_cost_floor = cheapest-first Σ(alloc×min). clearing = max(mins).
// per_kg = ceil1(clearing×1.04). total = per_kg×qty. supplier_cost = clearing×qty.
// margin = total − supplier_cost. Seed: floor 73,000 → clearing 7.5 → 7.8/kg →
// total 78,000, supplier_cost 75,000, margin 3,000.
import type { BuyerRequest, Quote, Supplier } from "../types";
import { num } from "../types";

export const MARKET_RANGE: [number, number] = [7.0, 8.3]; // mock, labeled in UI

export function pricePreview(request: Pick<BuyerRequest, "quantity_kg">, suppliers: Supplier[]) {
  const sorted = [...suppliers].sort((a, b) => num(a.min_price) - num(b.min_price));
  let need = request.quantity_kg;
  let min_cost_floor = 0;
  let clearing = 0;
  for (const s of sorted) {
    if (need <= 0) break;
    const take = Math.min(need, num(s.quantity_kg));
    min_cost_floor += take * num(s.min_price);
    if (take > 0) clearing = Math.max(clearing, num(s.min_price));
    need -= take;
  }
  return { min_cost_floor: Math.round(min_cost_floor), clearing };
}

export function pricingAgent(
  request: Pick<BuyerRequest, "quantity_kg" | "delivery_days">,
  analysis: { confidence: number; quotable: boolean },
  suppliers: Supplier[]
): Quote {
  if (!analysis.quotable) {
    return { quantity_kg: request.quantity_kg, per_kg: 0, total: 0, supplier_cost: 0, margin: 0, clearing_per_kg: 0, min_cost_floor: 0, market_range: MARKET_RANGE, delivery_days: request.delivery_days, confidence: analysis.confidence, quotable: false, reason: "Insufficient supply — confidence below 60%." };
  }
  const { min_cost_floor, clearing } = pricePreview(request, suppliers);
  const per_kg = Math.ceil(clearing * 1.04 * 10) / 10;
  const total = Math.round(per_kg * request.quantity_kg);
  const supplier_cost = Math.round(clearing * request.quantity_kg);
  const margin = total - supplier_cost;
  return { quantity_kg: request.quantity_kg, per_kg, total, supplier_cost, margin, clearing_per_kg: clearing, min_cost_floor, market_range: MARKET_RANGE, delivery_days: request.delivery_days, confidence: analysis.confidence, quotable: true };
}
