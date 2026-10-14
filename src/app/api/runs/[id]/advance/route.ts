import { advancePlanRun } from "@/lib/ai/orchestrator";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { supabase } from "@/lib/supabase";
import { json, err, statusOf } from "@/lib/http";

// POST { opKey? } → execute ONE bounded step under lease. Concurrent tabs: one commits.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { opKey?: string };
    const sb = supabase();
    const { data: run } = await sb.from("agent_runs").select("request_id").eq("id", id).single();
    if (!run) return err("Run not found", 404);
    await assertBuyer(req, await loadRequest((run as { request_id: string }).request_id));
    return json(await advancePlanRun(id, opKeyOf(req, body)));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Advance failed", statusOf(e));
  }
}
