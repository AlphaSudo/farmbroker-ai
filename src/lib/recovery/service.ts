// Shortage recovery (1.6): one incident per failure, AI-selected VALID replacement,
// committed through the atomic reservation service. Never reselects rejected lots.
import { supabase } from "../supabase";
import { chatJSON } from "../ai";
import { SelectionSchema } from "../ai/schemas";
import { eligibleSuppliers } from "../domain/eligibility";
import { candidatePlans, type Plan } from "../procurement/plans";
import { recordEvent } from "../domain/events";
import type { Supplier } from "../types";
import { num } from "../types";

export async function acceptedCoverage(dealId: string): Promise<{ accepted: number; target: number; failedLots: string[] }> {
  const sb = supabase();
  const { data: deal } = await sb.from("deals").select("request_id, buyer_requests!inner(quantity_kg)").eq("id", dealId).single();
  const target = num((deal as unknown as { buyer_requests: { quantity_kg: number } }).buyer_requests.quantity_kg);
  const { data: allocs } = await sb.from("allocations").select("allocated_kg,usable_kg,inspection_status,supplier_id").eq("deal_id", dealId);
  let accepted = 0;
  const failedLots: string[] = [];
  for (const a of (allocs ?? []) as Array<{ allocated_kg: number; usable_kg: number | null; inspection_status: string; supplier_id: string }>) {
    if (a.inspection_status === "passed") accepted += num(a.allocated_kg);
    else if (a.inspection_status === "partial") accepted += Math.min(num(a.usable_kg ?? 0), num(a.allocated_kg));
    else if (a.inspection_status === "failed") failedLots.push(a.supplier_id);
  }
  return { accepted, target, failedLots };
}

export async function openIncident(dealId: string, opKey: string) {
  const sb = supabase();
  const { accepted, target } = await acceptedCoverage(dealId);
  if (accepted >= target) return { incident: null as null, missing: 0 };
  const missing = target - accepted;
  const { data: open } = await sb.from("shortage_incidents").select("*").eq("deal_id", dealId).in("status", ["open", "recovering"]).limit(1).maybeSingle();
  if (open) return { incident: open, missing };
  const { data, error } = await sb.from("shortage_incidents").insert({ deal_id: dealId, missing_kg: missing, status: "open", op_key: opKey }).select("*").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: r2 } = await sb.from("shortage_incidents").select("*").eq("op_key", opKey).single();
      return { incident: r2, missing, replayed: true };
    }
    throw error;
  }
  await recordEvent(dealId, "shortage_opened", { missing_kg: missing }, `${opKey}:event`);
  return { incident: data, missing };
}

export async function replacementCandidates(dealId: string): Promise<Plan[]> {
  const sb = supabase();
  const { data: deal } = await sb.from("deals").select("request_id, buyer_requests!inner(*)").eq("id", dealId).single();
  if (!deal) throw new Error("Deal not found");
  const req = (deal as unknown as { buyer_requests: { crop: string; pool: string; delivery_days: number; created_at: string } }).buyer_requests;
  const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", req.pool);
  const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], { crop: req.crop, pool: req.pool, delivery_days: req.delivery_days, requested_at: req.created_at });
  const { data: allocs } = await sb.from("allocations").select("supplier_id,allocated_kg,inspection_status").eq("deal_id", dealId);
  const committed = new Map<string, number>();
  const rejected = new Set<string>();
  for (const a of (allocs ?? []) as Array<{ supplier_id: string; allocated_kg: number; inspection_status: string }>) {
    if (a.inspection_status === "failed") rejected.add(a.supplier_id);
    else committed.set(a.supplier_id, (committed.get(a.supplier_id) ?? 0) + num(a.allocated_kg));
  }
  const free = sel.eligible
    .filter((s) => !rejected.has(s.id))
    .map((s) => ({ ...s, quantity_kg: Math.max(0, num(s.quantity_kg) - (committed.get(s.id) ?? 0)) }))
    .filter((s) => s.quantity_kg > 0);
  const { accepted, target } = await acceptedCoverage(dealId);
  return candidatePlans(free, target - accepted);
}

export async function commitRecovery(incidentId: string, candidateId: string, model: string | null, opKey: string) {
  const sb = supabase();
  const { data: incident, error } = await sb.from("shortage_incidents").select("*").eq("id", incidentId).single();
  if (error || !incident) throw Object.assign(new Error("Incident not found"), { status: 404 });
  const inc = incident as { id: string; deal_id: string; status: string };
  if (!["open", "recovering"].includes(inc.status)) throw Object.assign(new Error(`Incident is ${inc.status}`), { status: 409 });
  const candidates = await replacementCandidates(inc.deal_id);
  const plan = candidates.find((c) => c.id === candidateId);
  if (!plan) throw Object.assign(new Error("Unknown/infeasible replacement candidate"), { status: 422 });
  const { data: allocs } = await sb.from("allocations").select("attempt").eq("deal_id", inc.deal_id).order("attempt", { ascending: false }).limit(1);
  const attempt = (((allocs ?? []) as Array<{ attempt: number }>)[0]?.attempt ?? 1) + 1;
  const { error: rpcErr } = await sb.rpc("reserve_paid_plan", {
    p_deal_id: inc.deal_id, p_request_id: "", p_attempt: attempt, op_key: opKey,
    p_items: plan.items.map((i) => ({ supplier_id: i.supplier_id, kg: i.kg, cost: Math.round(i.kg * i.rate) })),
  });
  if (rpcErr) {
    if (/duplicate|unique/i.test(rpcErr.message)) return { replayed: true };
    if (/insufficient/i.test(rpcErr.message)) throw Object.assign(new Error("Replacement stock changed — replan."), { status: 409 });
    throw rpcErr;
  }
  await sb.from("recovery_attempts").insert({ incident_id: incidentId, plan, status: "committed", op_key: opKey });
  await sb.from("shortage_incidents").update({ status: "recovering" }).eq("id", incidentId);
  await recordEvent(inc.deal_id, "recovery_committed", { incident: incidentId, plan: plan.id, model }, `${opKey}:event`);
  return { replayed: false, plan: plan.id };
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
    } catch { /* deterministic below */ }
  }
  const pick = [...candidates].sort((a, b) => a.cost_total - b.cost_total)[0];
  return { candidate_id: pick.id, justification: "Cheapest feasible replacement (rules-assisted fallback).", model: null };
}
