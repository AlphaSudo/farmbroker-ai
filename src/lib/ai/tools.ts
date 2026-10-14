// Allowlisted domain tools (1.2). Every tool rechecks role + preconditions;
// buyer text is data, never authority. Read-only vs mutation classified.
import { supabase } from "../supabase";
import { availableSupply } from "../domain/supply";
import { candidatePlans, validatePlan } from "../procurement/plans";
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
  const req = r as { crop: string; pool: string; delivery_days: number; created_at: string; fixture_id?: string | null; quantity_kg: number };
  const sel = await availableSupply(req);
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
  const req = r as { crop: string; pool: string; delivery_days: number; created_at: string; fixture_id?: string | null; quantity_kg: number; max_price: number };
  const sel = await availableSupply(req);
  const need = num(req.quantity_kg);
  return candidatePlans(sel.eligible, need)
    .filter(plan => validatePlan(plan, sel.eligible, need, Number(req.max_price) * need).length === 0)
    .map(plan => ({ ...plan, strategy: plan.id }));
}
