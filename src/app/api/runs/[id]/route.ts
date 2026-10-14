import { supabase } from "@/lib/supabase";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";

// GET → run + steps timeline (owner-scoped). Refresh resumes state, never duplicates work.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const sb = supabase();
    const { data: run, error } = await sb.from("agent_runs").select("*").eq("id", id).single();
    if (error || !run) return err("Run not found", 404);
    const request = await loadRequest((run as { request_id: string }).request_id);
    await assertBuyer(req, request);
    const { data: steps } = await sb.from("agent_steps").select("kind,input,output,model,latency_ms,validation,created_at").eq("run_id", id).order("created_at");
    const { status, kind, policy_version, snapshot, lease_expires_at, attempts } = run as Record<string, unknown>;
    return json({ run: { id, status, kind, policy_version, snapshot, lease_expires_at, attempts }, steps: steps ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
