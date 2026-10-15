import { supabase } from "@/lib/supabase";
import { json, err, statusOf } from "@/lib/http";
import { assertBuyer, loadRequest } from "@/lib/auth/guard";
import { hubAuthorized } from "@/lib/auth/actor";

async function authorizeDeal(req: Request, dealId: string) {
  const deal = await supabase().from("deals").select("request_id").eq("id", dealId).single();
  if (deal.error || !deal.data) throw Object.assign(new Error("Deal not found"), { status: 404 });
  await assertBuyer(req, await loadRequest(deal.data.request_id));
}

// GET ?commandId= | ?jobId= → durable command/job status for polling UIs.
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const commandId = u.searchParams.get("commandId");
    const jobId = u.searchParams.get("jobId");
    const sb = supabase();
    if (commandId) {
      const { data, error } = await sb.from("command_receipts").select("command_id,deal_id,plan_hash,result,created_at").eq("command_id", commandId).single();
      if (error || !data) return err("Receipt not found", 404);
      await authorizeDeal(req, data.deal_id);
      return json({ receipt: data });
    }
    if (jobId) {
      const { data, error } = await sb.from("commerce_jobs").select("id,status,kind,attempt,result,error,created_at,payload").eq("id", jobId).single();
      if (error || !data) return err("Job not found", 404);
      if (!hubAuthorized(req)) {
        const payload = data.payload as { runId?: string; dealId?: string };
        if (payload.runId) {
          const run = await sb.from("agent_runs").select("request_id").eq("id", payload.runId).single();
          if (run.error || !run.data) return err("Run not found", 404);
          await assertBuyer(req, await loadRequest(run.data.request_id));
        } else if (payload.dealId) await authorizeDeal(req, payload.dealId);
        else return err("Hub access required", 403);
      }
      const { payload: _payload, ...job } = data; void _payload;
      return json({ job });
    }
    return err("commandId or jobId required");
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
