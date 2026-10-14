// Buyer DTOs: aggregates only. No names, IDs of suppliers, contacts, or costs
// in buyer JSON/HTML (1.1). Hub serializers keep operational detail.
import type { Allocation, Deal, Settlement } from "../types";
import { num } from "../types";

export function buyerProgress(target: number, covered: number, supplierCount: number) {
  return { target, covered, remaining: Math.max(0, target - covered), supplier_count: supplierCount };
}

export function buyerSettlement(s: Settlement) {
  const sorted = [...s.payouts].sort((a, b) => b.kg - a.kg);
  return {
    total: s.total, margin: s.margin, deal_id: s.deal_id,
    payouts: sorted.map((p, i) => ({ label: `Supplier ${String.fromCharCode(65 + i)}`, kg: p.kg, amount: p.amount, grade: p.grade, status: p.status })),
  };
}

export function buyerDeal(d: Deal) {
  const { ...rest } = d as Deal & { paypal_verified?: unknown };
  void rest;
  return { id: d.id, request_id: d.request_id, total_price: num(d.total_price), per_kg: num(d.per_kg), status: d.status, outcome: (d as { outcome?: string }).outcome ?? "pending", paypal_capture_id: d.paypal_capture_id };
}

export function hubAllocation(a: Allocation) {
  return { id: a.id, allocated_kg: num(a.allocated_kg), cost: num(a.cost), attempt: (a as { attempt?: number }).attempt ?? 1, inspection_status: a.inspection_status, quality_grade: a.quality_grade, usable_kg: a.usable_kg == null ? null : num(a.usable_kg), name: a.supplier?.name ?? "Supplier" };
}
