// Shortage recovery (1.6): one incident per failure, AI-selected VALID replacement,
// committed through the atomic reservation service. Never reselects rejected lots.
import { supabase } from "../supabase";
import { chatJSON } from "../ai";
import { SelectionSchema } from "../ai/schemas";
import { availableSupply } from "../domain/supply";
import { acceptedKg } from "../domain/coverage";
import { candidatePlans, type Plan } from "../procurement/plans";
import { num } from "../types";

export async function acceptedCoverage(dealId: string): Promise<{ accepted: number; target: number; failedLots: string[] }> {
  const sb = supabase();
  const { data: deal, error } = await sb.from("deals").select("request_id, buyer_requests!inner(quantity_kg)").eq("id", dealId).single();
  if (error || !deal) throw Object.assign(new Error("Deal not found"), { status: 404 });
  const target = num((deal as unknown as { buyer_requests: { quantity_kg: number } }).buyer_requests.quantity_kg);
  const { data: allocs, error: allocationsError } = await sb.from("allocations").select("allocated_kg,weight_received_kg,usable_kg,inspection_status,supplier_id").eq("deal_id", dealId);
  if (allocationsError) throw allocationsError;
  let accepted = 0;
  const failedLots: string[] = [];
  for (const a of (allocs ?? []) as Array<{ allocated_kg: number; usable_kg: number | null; weight_received_kg: number | null; inspection_status: string; supplier_id: string }>) {
    accepted += acceptedKg(a);
    if (a.inspection_status === "failed") failedLots.push(a.supplier_id);
  }
  return { accepted, target, failedLots };
}

export async function openIncident(dealId: string, opKey: string) {
  const result = await supabase().rpc("open_paid_shortage", { p_deal: dealId, p_op_key: opKey });
  if (result.error) throw Object.assign(new Error(result.error.message), { status: /paid verification/.test(result.error.message) ? 403 : 409 });
  return result.data as { incident: { id: string; status: string } | null; missing: number; replayed?: boolean };

}

export async function replacementCandidates(dealId: string): Promise<Plan[]> {
  const sb = supabase();
  const { data: deal } = await sb.from("deals").select("request_id, buyer_requests!inner(*)").eq("id", dealId).single();
  if (!deal) throw new Error("Deal not found");
  const req = (deal as unknown as { buyer_requests: { crop: string; pool: string; delivery_days: number; created_at: string; fixture_id?: string | null } }).buyer_requests;
  const sel = await availableSupply(req, true);
  const { accepted, target, failedLots } = await acceptedCoverage(dealId);
  const budget = await sb.from("deals").select("clearing_per_kg").eq("id", dealId).single();
  if (budget.error) throw budget.error;
  const eligible = sel.eligible.filter(s => !failedLots.includes(s.id) && Number(s.min_price) <= Number(budget.data.clearing_per_kg));
  return target > accepted ? candidatePlans(eligible, target - accepted) : [];

}

export async function commitRecovery(incidentId: string, candidateId: string, model: string | null, opKey: string, job?: { id: string; token: string }) {
  const sb = supabase();
  const { data: incident, error } = await sb.from("shortage_incidents").select("*").eq("id", incidentId).single();
  if (error || !incident) throw Object.assign(new Error("Incident not found"), { status: 404 });
  const inc = incident as { id: string; deal_id: string; status: string };
  if (!["open", "recovering"].includes(inc.status)) throw Object.assign(new Error(`Incident is ${inc.status}`), { status: 409 });
  const prior = await sb.from("recovery_attempts").select("plan").eq("op_key", opKey).maybeSingle();
  if (prior.error) throw prior.error;
  if (prior.data) return { replayed: true, plan: prior.data.plan?.id };
  const candidates = await replacementCandidates(inc.deal_id);
  const plan = candidates.find((c) => c.id === candidateId);
  if (!plan) throw Object.assign(new Error("Unknown/infeasible replacement candidate"), { status: 422 });
  const result = await sb.rpc(job ? "commit_job_recovery" : "commit_recovery_plan", { p_incident: incidentId, p_plan: plan, p_model: model, p_op_key: opKey, ...(job ? { p_job: job.id, p_token: job.token } : {}) });
  if (result.error) throw Object.assign(new Error(result.error.message), { status: 409 });
  return result.data;

}

export async function aiSelectReplacement(candidates: Plan[]): Promise<{ candidate_id: string; justification: string; model: string | null }> {
  const ai = await chatJSON(
    "You choose ONE feasible replacement lot plan by ID to restore a paid order. Never invent lots. Reply JSON {\"candidate_id\":...,\"justification\":...}.",
    `Candidates:\n${candidates.map((c) => `- ${c.id}: cost ${c.cost_total}, ${c.items.length} lots`).join("\n")}`
  );
  if (ai) {
    try {
      const v = SelectionSchema.safeParse(JSON.parse(ai.text.match(/\{[\s\S]*\}/)?.[0] ?? "null"));
      const sel = v.success ? v.data : null;
      if (sel && candidates.some((c) => c.id === sel.candidate_id)) return { ...sel, model: ai.model };
    } catch { /* invalid model output leaves recovery uncommitted */ }
  }
  throw Object.assign(new Error("Live AI selection unavailable or invalid. Recovery is open; retry without committing stock."), { status: 503 });
}
