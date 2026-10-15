import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { completeJob, failJob } from "@/lib/jobs/service";
import { advancePlanRun } from "@/lib/ai/orchestrator";
import { json, err, statusOf } from "@/lib/http";

const authed = (req: Request): boolean =>
  hubAuthorized(req) || (!!process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET);

// POST /api/internal/workers/run — claim ONE due job, execute bounded, fence on complete.
// Provider I/O happens here, never while holding inventory locks.
export async function POST(req: Request) {
  try {
    if (!authed(req)) return err("Worker access required", 403);
    const sb = supabase();
    const aiLeased = await sb.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "leased").eq("kind", "ai_plan");
    const kinds = (aiLeased.count ?? 0) >= 2 ? ["reconcile_check", "recovery_advance"] : ["ai_plan", "recovery_advance", "reconcile_check"];
    const { data: job, error } = await sb.rpc("claim_due_job", { p_worker: "vercel", p_kinds: kinds });
    if (error) throw error;
    if (!job) return json({ claimed: false });
    const j = (Array.isArray(job) ? job[0] : job) as {
      id: string; op_key: string; scope: string; kind: string; payload: { runId?: string; dealId?: string }; lease_token: string;
    };
    if (!j) return json({ claimed: false });
    try {
      let result: object = {};
      if (j.kind === "ai_plan" && j.payload.runId) {
        result = await advancePlanRun(j.payload.runId, `${j.op_key}:exec`);
      } else if (j.kind === "recovery_advance" && j.payload.dealId) {
        const { openIncident, replacementCandidates, aiSelectReplacement, commitRecovery } = await import("@/lib/recovery/service");
        const { incident } = await openIncident(j.payload.dealId, `${j.op_key}:incident`);
        if (!incident) result = { recovered: true, note: "coverage complete" };
        else {
          const candidates = await replacementCandidates(j.payload.dealId);
          if (!candidates.length) result = { refundEligible: true };
          else {
            const sel = await aiSelectReplacement(candidates);
            result = { ...(await commitRecovery((incident as { id: string }).id, sel.candidate_id, sel.model, `${j.op_key}:commit`)), provenance: sel.model ? `Live AI (${sel.model})` : "Manual/rules-assisted" };
          }
        }
      } else if (j.kind === "reconcile_check") {
        result = { checked: true, at: new Date().toISOString() };
      } else if (j.kind === "projection" && j.payload.dealId) {
        const { buildSummary } = await import("@/lib/queries/summary");
        const sb2 = (await import("@/lib/supabase")).supabase();
        const { data: dd } = await sb2.from("deals").select("request_id").eq("id", j.payload.dealId).single();
        if (!dd) throw new Error("deal not found for projection");
        const s = await buildSummary((dd as { request_id: string }).request_id);
        await sb2.from("order_summaries").upsert({ deal_id: j.payload.dealId, version: s.version, summary: s });
        result = { projected: true, version: s.version };
      }
      const committed = await completeJob(j.id, j.lease_token, result);
      return json({ claimed: true, job: j.id, fenced: !committed, result });
    } catch (e) {
      await failJob(j.id, j.lease_token, e instanceof Error ? e.message : "worker error");
      return err(e instanceof Error ? e.message : "worker failed", statusOf(e));
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Worker failed", statusOf(e));
  }
}

// GET → queue health: oldest wait, leases, counts (Hub).
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const { jobHealth } = await import("@/lib/jobs/service");
    return json(await jobHealth());
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
