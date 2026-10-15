import { supabase } from "../supabase";
import { completeJob, failJob } from "./service";
import { advancePlanRun } from "../ai/orchestrator";
import { reconcileDeal, processProviderEvent } from "../paypal-reconciliation";

export async function runNextJob() {
  const sb = supabase();
  const claim = await sb.rpc("claim_due_job", { p_worker: "vercel", p_kinds: ["ai_plan", "recovery_advance", "reconcile_check", "paypal_event", "projection", "procure_bound"] });
  if (claim.error) throw claim.error;
  const j = (Array.isArray(claim.data) ? claim.data[0] : claim.data) as null | {
    id: string; op_key: string; scope: string; kind: string; lease_token: string; expected_version: number;
    payload: { runId?: string; dealId?: string; eventId?: string; decisionId?: string; quoteId?: string };
  };
  if (!j) return { claimed: false };
  try {
    let result: object;
    if (j.kind === "ai_plan" && j.payload.runId) {
      result = await advancePlanRun(j.payload.runId, j.op_key + ":exec");
      if ((result as { status?: string }).status === "running") throw new Error("Planning run still leased; retry later");
    } else if (j.kind === "recovery_advance" && j.payload.dealId) {
      const state = await sb.from("deals").select("outcome").eq("id", j.payload.dealId).single();
      if (state.error) throw state.error;
      if (state.data.outcome !== "pending") {
        const committed = await completeJob(j.id, j.lease_token, { closed: true });
        return { claimed: true, job: j.id, fenced: !committed, result: { closed: true } };
      }
      const { openIncident, replacementCandidates, aiSelectReplacement, commitRecovery } = await import("../recovery/service");
      const { incident } = await openIncident(j.payload.dealId, j.op_key + ":incident");
      if (!incident) result = { recovered: true };
      else if (incident.status !== "open") result = { status: incident.status, awaitingInspection: incident.status === "recovering" };
      else {
        const attempts = await sb.from("allocations").select("attempt").eq("deal_id", j.payload.dealId).order("attempt", { ascending: false }).limit(1);
        if (attempts.error) throw attempts.error;
        const candidates = Number(attempts.data?.[0]?.attempt ?? 1) >= 3 ? [] : await replacementCandidates(j.payload.dealId);
        if (!candidates.length) {
          const updated = await sb.from("shortage_incidents").update({ status: "refund_eligible" }).eq("id", incident.id).eq("status", "open");
          if (updated.error) throw updated.error;
          result = { refundEligible: true };
        } else {
          const sel = await aiSelectReplacement(candidates);
          result = await commitRecovery(incident.id, sel.candidate_id, sel.model, j.op_key + ":commit", { id: j.id, token: j.lease_token });
        }
      }
    } else if (j.kind === "reconcile_check") {
      result = await reconcileDeal(j.payload.dealId ?? j.scope, true);
      if ((result as { pending?: boolean }).pending) throw new Error("Provider operation pending; reconcile original operation later");
    } else if (j.kind === "procure_bound" && j.payload.dealId && j.payload.decisionId && j.payload.quoteId) {
      const prior = await sb.from("command_receipts").select("result").eq("deal_id", j.payload.dealId).eq("quote_id", j.payload.quoteId).eq("decision_id", j.payload.decisionId).maybeSingle();
      if (prior.error) throw prior.error;
      if (prior.data) result = { ...prior.data.result, replayed: true };
      else {
        const executed = await sb.rpc("execute_bound_plan", { p_command_id: j.op_key, p_deal_id: j.payload.dealId, p_expected_version: j.expected_version, p_quote_id: j.payload.quoteId, p_decision_id: j.payload.decisionId, p_attempt: 1, p_op_key: j.op_key });
        if (executed.error) throw executed.error;
        result = executed.data;
      }
    } else if (j.kind === "paypal_event" && j.payload.eventId) {
      result = await processProviderEvent(j.payload.eventId);
    } else if (j.kind === "projection" && j.payload.dealId) {
      const { buildSummary } = await import("../queries/summary");
      const deal = await sb.from("deals").select("request_id").eq("id", j.payload.dealId).single();
      if (deal.error || !deal.data) throw new Error("Projection deal not found");
      const summary = await buildSummary(deal.data.request_id);
      const stored = await sb.from("order_summaries").upsert({ deal_id: j.payload.dealId, version: summary.version, summary });
      if (stored.error) throw stored.error;
      result = { projected: true, version: summary.version };
    } else throw new Error("Unsupported job or missing payload reference");
    const completed = await completeJob(j.id, j.lease_token, result);
    return { claimed: true, job: j.id, fenced: !completed, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Worker failed";
    await failJob(j.id, j.lease_token, message);
    return { claimed: true, job: j.id, retryOrReview: true, error: message };
  }
}
