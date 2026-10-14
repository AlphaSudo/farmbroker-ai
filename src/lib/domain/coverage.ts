import { num } from "../types";

// Inspection evidence, rather than the promised weight, defines accepted stock.
export function acceptedKg(a: { inspection_status: string; allocated_kg: unknown; usable_kg?: unknown; weight_received_kg?: unknown }): number {
  if (!["passed", "partial"].includes(a.inspection_status)) return 0;
  const values = [num(a.allocated_kg), num(a.usable_kg ?? 0)];
  if (a.weight_received_kg != null) values.push(num(a.weight_received_kg));
  return values.every(Number.isFinite) ? Math.max(0, Math.min(...values)) : 0;
}

export function committedKg(a: Parameters<typeof acceptedKg>[0]): number {
  return a.inspection_status === "pending" ? Math.max(0, num(a.allocated_kg)) : acceptedKg(a);
}
