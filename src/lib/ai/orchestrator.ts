// One small orchestrator (1.2): model selects a candidate ID from a server-built
// feasible set; code validates + executes. Runs/steps persisted with lease + op keys.
import { supabase } from "../supabase";
import { chatJSON, aiOff } from "../ai";
import { SelectionSchema } from "./schemas";
import { evaluate_candidate_plans } from "./tools";

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
  const claim = await sb.rpc("claim_agent_run", { p_run: runId });
  if (claim.error) throw Object.assign(new Error(claim.error.message), { status: 404 });
  const { claimed, run: r } = claim.data;
  if (!claimed) return { replayed: true, status: r.status, ...(r.snapshot.result ?? {}) };
  const key = `${runId}:${r.attempts}:${opKey}`;
  const t0 = Date.now();
  try {
    const candidates = await evaluate_candidate_plans(r.request_id);
    const summaries = candidates.map(c => ({ id: c.id, strategy: c.strategy, total_kg: c.total_kg, lots: c.items.length }));
    await step(runId, "evaluate", { request: r.request_id }, { candidates: summaries }, null, Date.now() - t0, candidates.length ? "ok" : "no feasible candidate", `${key}:eval`);
    if (!candidates.length) {
      const failed = await sb.from("agent_runs").update({ status: "failed" }).eq("id", runId).eq("lease_token", r.lease_token);
      if (failed.error) throw failed.error;
      throw Object.assign(new Error("No feasible candidate - order cannot be promised."), { status: 422 });
    }
    const prompt = `Feasible supply plans:\n${candidates.map(c => `- ${c.id}: ${c.strategy}, cost ${c.cost_total}, ${c.items.length} lots`).join("\n")}\nPick exactly one listed ID. Reply JSON {"candidate_id":"...","justification":"..."} (under 120 words).`;
    if (Date.now() - t0 > 25000) throw Object.assign(new Error("Planning deadline exceeded - run paused for retry."), { status: 503 });
    const { singleFlight, planningKey } = await import("../planning/cache");
    let ai: { text: string; model: string } | null = null;
    let sharedCall = false;
    if (!aiOff()) {
      const called = await singleFlight(`plan:${planningKey({ c: candidates.map(c => c.id), policy: "v1" })}`, () =>
        chatJSON("Select one feasible procurement plan ID. Never invent suppliers, quantities, or prices. Reply JSON only.", prompt));
      ai = called.result; sharedCall = called.shared;
    }
    let selection = null as null | { candidate_id: string; justification: string };
    if (ai) {
      try {
        const parsed = SelectionSchema.safeParse(JSON.parse(ai.text.match(/\{[\s\S]*\}/)?.[0] ?? "null"));
        if (parsed.success && candidates.some(c => c.id === parsed.data.candidate_id)) selection = parsed.data;
      } catch { /* invalid model output never commits a plan */ }
    }
    await step(runId, "select", { candidates: candidates.map(c => c.id) }, selection ?? { valid: false }, ai?.model ?? null, Date.now() - t0, selection ? "ok" : "rejected: invalid/unavailable selection", `${key}:select`);
    if (!selection) throw Object.assign(new Error("Live AI unavailable or invalid - run paused for retry."), { status: 503 });
    const { recordDecision } = await import("./decisions");
    const decision = await recordDecision({ runId, requestId: r.request_id, selection, candidates, model: ai!.model });
    const result = { selection, provenance: `Live AI (${ai!.model})`, candidates: summaries, decisionId: decision.id, planHash: decision.plan_hash };
    const completed = await sb.from("agent_runs").update({ status: "decided", snapshot: { ...r.snapshot, selection, result } }).eq("id", runId).eq("lease_token", r.lease_token).select("id").maybeSingle();
    if (completed.error) throw completed.error;
    if (!completed.data) throw Object.assign(new Error("Run lease changed; refresh stored state."), { status: 409 });
    return { replayed: false, ...result };
  } catch (e) {
    const paused = await sb.from("agent_runs").update({ status: "paused" }).eq("id", runId).eq("lease_token", r.lease_token).eq("status", "running");
    if (paused.error) throw paused.error;
    throw e;
  }
}

async function step(runId: string, kind: string, input: object, output: object, model: string | null, latency: number, validation: string, opKey: string) {
  const { error } = await supabase().from("agent_steps").insert({ run_id: runId, kind, input, output, model, latency_ms: latency, validation, op_key: opKey });
  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}
