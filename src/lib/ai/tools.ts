// Allowlisted domain tools (1.2). Every tool rechecks role + preconditions;
// buyer text is data, never authority. Read-only vs mutation classified.
import { supabase } from "../supabase";
import { eligibleSuppliers } from "../domain/eligibility";
import type { Supplier } from "../types";
import { num } from "../types";

export type ToolName = "get_request" | "get_supply_snapshot" | "evaluate_candidate_plans" | "select_plan" | "explain_decision";
export const READ_TOOLS: ToolName[] = ["get_request", "get_supply_snapshot", "evaluate_candidate_plans", "explain_decision"];

export async function get_request(requestId: string) {
  const { data, error } = await supabase().from("buyer_requests").select("id,crop,quantity_kg,delivery_days,max_price,status,pool,scenario,created_at").eq("id", requestId).single();
  if (error || !data) throw new Error("request not found");
  const { ...rest } = data as Record<string, unknown>;
  return rest;
}

export async function get_supply_snapshot(requestId: string) {
  const sb = supabase();
  const { data: r, error } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
  if (error || !r) throw new Error("request not found");
  const req = r as { crop: string; pool: string; delivery_days: number; created_at: string; quantity_kg: number };
  const { data: suppliers } = await sb.from("suppliers").select("id,crop,quantity_kg,min_price,available_date,location,quality_score,pool").eq("pool", req.pool);
  const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], { crop: req.crop, pool: req.pool, delivery_days: req.delivery_days, requested_at: req.created_at });
  return {
    deadline: sel.deadline, assumedOnTime: sel.assumedOnTime,
    eligible: sel.eligible.map((s) => ({ ref: s.id.slice(0, 8), supplier_id: s.id, kg: num(s.quantity_kg), min_price: num(s.min_price), quality_score: s.quality_score, location: s.location })),
    excludedCount: sel.excluded.length,
  };
}

export interface Candidate { id: string; strategy: "cost-first" | "reliability-first"; items: Array<{ supplier_id: string; kg: number; rate: number }>; total_kg: number; cost_total: number; }

export async function evaluate_candidate_plans(requestId: string): Promise<Candidate[]> {
  const sb = supabase();
  const { data: r } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
  if (!r) throw new Error("request not found");
  const req = r as { crop: string; pool: string; delivery_days: number; created_at: string; quantity_kg: number; max_price: number };
  const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", req.pool);
  const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], { crop: req.crop, pool: req.pool, delivery_days: req.delivery_days, requested_at: req.created_at });
  const need = num(req.quantity_kg);
  const mk = (sorted: Supplier[], strategy: Candidate["strategy"]): Candidate | null => {
    let left = need;
    const items: Candidate["items"] = [];
    for (const s of sorted) {
      if (left <= 0) break;
      const take = Math.min(left, num(s.quantity_kg));
      items.push({ supplier_id: s.id, kg: take, rate: num(s.min_price) });
      left -= take;
    }
    if (left > 0) return null;
    return { id: `${strategy}`, strategy, items, total_kg: need, cost_total: items.reduce((t, i) => t + i.kg * i.rate, 0) };
  };
  const byCost = [...sel.eligible].sort((a, b) => num(a.min_price) - num(b.min_price));
  const byReliability = [...sel.eligible].sort((a, b) => (num(b.quality_score ?? 0) - num(a.quality_score ?? 0)) || (num(a.min_price) - num(b.min_price)));
  return [mk(byCost, "cost-first"), mk(byReliability, "reliability-first")].filter((c): c is Candidate => !!c);
}
