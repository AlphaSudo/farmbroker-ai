import { createRun } from "@/lib/ai/orchestrator";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import { supabase } from "@/lib/supabase";

export async function GET(req: Request) {
  try {
    const requestId = new URL(req.url).searchParams.get("requestId");
    if (!requestId) return err("requestId required");
    await assertBuyer(req, await loadRequest(requestId));
    const latest = await supabase().from("agent_runs").select("id").eq("request_id", requestId).eq("kind", "plan_selection").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw latest.error;
    return json({ runId: latest.data?.id ?? null });
  } catch (e) { return err(e instanceof Error ? e.message : "Run lookup failed", statusOf(e)); }
}

// POST { requestId, kind? } → open a run (reads only; prepayment runs never mutate).
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { requestId?: string; kind?: "plan_selection" | "recovery_selection" | "intent_parse" };
    if (!body.requestId) return err("requestId required");
    const request = await loadRequest(body.requestId);
    await assertBuyer(req, request);
    const runId = await createRun(body.requestId, null, body.kind ?? "plan_selection", { pool: request.pool, scenario: request.scenario, policy: "v1" });
    return json({ runId }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
