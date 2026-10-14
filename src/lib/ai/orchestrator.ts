// One small orchestrator (1.2): model selects a candidate ID from a server-built
// feasible set; code validates + executes. Runs/steps persisted with lease + op keys.
import { supabase } from "../supabase";
import { chatJSON } from "../ai";
import { SelectionSchema } from "./schemas";
import { evaluate_candidate_plans, type Candidate } from "./tools";

const LEASE_MS = 120000;

export async function createRun(requestId: string, dealId: string | null, kind: "plan_selection" | "recovery_selection" | "intent_parse", snapshot: object) {
  const { data, error } = await supabase().from("agent_runs").insert({
    request_id: requestId, deal_id: dealId, kind, status: "open", policy_version: "v1",
    snapshot, lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(), attempts: 0,
  }).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function advancePlanRun(runId: string, opKey: string) {
  const sb = supabase();
  const { data: run, error } = await sb.from("agent_runs").select("*").eq("id", runId).single();
  if (error || !run) throw Object.assign(new Error("run not found"), { status: 404 });
  const r = run as { id: string; request_id: string; status: string; lease_expires_at: string; attempts: number; snapshot: { candidates?: Candidate[] } };
  if (r.status !== "open") return { replayed: true, status: r.status };
  if (new Date(r.lease_expires_at).getTime() < Date.now()) throw Object.assign(new Error("Run lease expired — resume with a fresh advance."), { status: 409 });
  const { data: seen } = await sb.from("agent_steps").select("output").eq("op_key", opKey).maybeSingle();
  if (seen) return { replayed: true, ...(seen as { output: object }).output };

  const t0 = Date.now();
  const candidates = await evaluate_candidate_plans(r.request_id);
  if (candidates.length === 0) {
    await sb.from("agent_runs").update({ status: "failed" }).eq("id", runId);
    await step(runId, "evaluate", { request: r.request_id }, { feasible: 0 }, null, Date.now() - t0, "no feasible candidate", opKey);
    throw Object.assign(new Error("No feasible candidate — order cannot be promised."), { status: 422 });
  }
  await step(runId, "evaluate", { request: r.request_id }, { candidates: candidates.map((c) => ({ id: c.id, strategy: c.strategy, total_kg: c.total_kg, cost_total: c.cost_total, lots: c.items.length })) }, null, Date.now() - t0, "ok", `${opKey}:eval`);

  const prompt = `Feasible supply plans (IDs are authoritative):\n${candidates.map((c) => `- ${c.id}: ${c.strategy}, cost ${c.cost_total}, ${c.items.length} lots`).join("\n")}\nPick EXACTLY one listed ID. Reply JSON {"candidate_id": "...", "justification": "..."} (<=120 words).`;
  const ai = await chatJSON("You select one feasible procurement plan ID. Never invent suppliers, quantities, or prices. Reply JSON only.", prompt);
  let parsed = null as null | { candidate_id: string; justification: string };
  let model: string | null = null;
  if (ai) {
    try {
      const j = JSON.parse(ai.text.match(/\{[\s\S]*\}/)?.[0] ?? "null");
      const v = SelectionSchema.safeParse(j);
      if (v.success) { parsed = v.data; model = ai.model; }
    } catch { /* fall through */ }
  }
  if (!parsed || !candidates.some((c) => c.id === parsed!.candidate_id)) {
    await step(runId, "select", { candidates: candidates.map((c) => c.id) }, { raw: ai?.text?.slice(0, 300) ?? null }, model, Date.now() - t0, "rejected: unknown/invalid candidate", `${opKey}:select`);
    await sb.from("agent_runs").update({ status: "paused" }).eq("id", runId);
    throw Object.assign(new Error("Model selection invalid — run paused, no plan committed."), { status: 502 });
  }
  await step(runId, "select", { candidates: candidates.map((c) => c.id) }, parsed, model, Date.now() - t0, "ok", `${opKey}:select`);
  await sb.from("agent_runs").update({ status: "decided", snapshot: { ...(r.snapshot as object), selection: parsed } }).eq("id", runId);
  return { replayed: false, selection: parsed, provenance: model ? `Live AI (${model})` : "Manual/rules-assisted", candidates };
}

async function step(runId: string, kind: string, input: object, output: object, model: string | null, latency: number, validation: string, opKey: string) {
  const { error } = await supabase().from("agent_steps").insert({ run_id: runId, kind, input, output, model, latency_ms: latency, validation, op_key: opKey });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}
