// Decision records (2.2): canonical content hashes, dedupe, expiry, server-loaded plans.
import { createHash } from "crypto";
import { supabase } from "../supabase";
import type { Candidate } from "../ai/tools";

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sortKeys(x)]))
  : v;
export const hashOf = (v: unknown): string => createHash("sha256").update(JSON.stringify(sortKeys(v))).digest("hex");

export async function snapshotFor(requestId: string) {
  const sb = supabase();
  const { data: r, error } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
  if (error || !r) throw new Error("request not found");
  const req = r as { crop: string; quantity_kg: number; delivery_days: number; max_price: number; pool: string; scenario: string };
  const spec = { crop: req.crop, quantity_kg: Number(req.quantity_kg), delivery_days: req.delivery_days, pool: req.pool, scenario: req.scenario, spec_version: 1 };
  const spec_hash = hashOf(spec);
  const { data: same } = await sb.from("planning_snapshots").select("id").eq("request_id", requestId).eq("spec_hash", spec_hash).limit(1).maybeSingle();
  if (same) return same as { id: string };
  const { data, error: iErr } = await sb.from("planning_snapshots").insert({ request_id: requestId, spec_hash, snapshot: { ...spec, policy_version: "v1" } }).select("id").single();
  if (iErr) throw iErr;
  return data as { id: string };
}

export async function plansFor(snapshotId: string, candidates: Candidate[]) {
  const sb = supabase();
  const out: Array<{ id: string; plan_hash: string; items: Candidate["items"]; strategy: string; cost_total: number }> = [];
  for (const c of candidates) {
    const items = [...c.items].sort((a, b) => (a.supplier_id < b.supplier_id ? -1 : 1)).map((i) => ({ supplier_id: i.supplier_id, kg: i.kg, rate: i.rate }));
    const plan_hash = hashOf({ items, total_kg: c.total_kg });
    const { data: same } = await sb.from("procurement_plans").select("id").eq("plan_hash", plan_hash).limit(1).maybeSingle();
    if (same) { out.push({ id: (same as { id: string }).id, plan_hash, items, strategy: c.strategy, cost_total: c.cost_total }); continue; }
    const { data, error } = await sb.from("procurement_plans").insert({ snapshot_id: snapshotId, strategy: c.strategy, items, cost_total: c.cost_total, plan_hash }).select("id").single();
    if (error) throw error;
    out.push({ id: (data as { id: string }).id, plan_hash, items, strategy: c.strategy, cost_total: c.cost_total });
  }
  return out;
}

export async function recordDecision(input: { runId: string | null; requestId: string; selection: { candidate_id: string; justification: string }; candidates: Candidate[]; model: string | null; promptVersion?: string }) {
  const sb = supabase();
  const snap = await snapshotFor(input.requestId);
  const plans = await plansFor(snap.id, input.candidates);
  const ids = input.candidates.map((c) => c.id);
  if (!ids.includes(input.selection.candidate_id)) throw new Error("selection outside stored feasible set");
  const plan = plans.find((p, i) => input.candidates[i].id === input.selection.candidate_id)!;
  const candidate_hash = hashOf([...ids].sort());
  const { data, error } = await sb.from("decision_records").insert({
    run_id: input.runId, request_id: input.requestId, spec_version: 1, policy_version: "v1",
    model: input.model, prompt_version: input.promptVersion ?? "p1",
    candidate_hash, plan_hash: plan.plan_hash, plan_id: plan.id,
    evidence: { candidates: ids, justification: input.selection.justification },
    expires_at: new Date(Date.now() + 30 * 60000).toISOString(), status: "valid",
  }).select("id").single();
  if (error) throw error;
  return { id: (data as { id: string }).id, plan_hash: plan.plan_hash, plan_id: plan.id, items: plan.items };
}

export async function loadDecision(id: string) {
  const { data, error } = await supabase().from("decision_records").select("*").eq("id", id).single();
  if (error || !data) throw Object.assign(new Error("decision not found"), { status: 404 });
  const d = data as { status: string; expires_at: string };
  if (d.status !== "valid") throw Object.assign(new Error(`decision ${d.status}`), { status: 409 });
  if (new Date(d.expires_at).getTime() < Date.now()) throw Object.assign(new Error("decision expired"), { status: 410 });
  return data as { id: string; request_id: string; plan_hash: string; plan_id: string; model: string | null };
}
