import { supabase } from "@/lib/supabase";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";

// POST { dealId, decisionId, expectedVersion, quoteId, commandId? } → bound execution.
// Server loads trusted items from the stored plan; client/model input cannot substitute stock.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { dealId?: string; decisionId?: string; expectedVersion?: number; quoteId?: string; commandId?: string; opKey?: string };
    if (!body.dealId || !body.decisionId || body.expectedVersion === undefined || !body.quoteId) return err("dealId + decisionId + expectedVersion + quoteId required");
    const sb = supabase();
    const { data: deal } = await sb.from("deals").select("request_id").eq("id", body.dealId).single();
    if (!deal) return err("Deal not found", 404);
    await assertBuyer(req, await loadRequest((deal as { request_id: string }).request_id));
    const { data: existing } = await sb.from("command_receipts").select("result").eq("command_id", body.commandId ?? opKeyOf(req, body)).maybeSingle();
    if (existing) return json({ ...(existing as { result: object }).result, replayed: true });
    const { data, error } = await sb.rpc("execute_bound_plan", {
      p_command_id: body.commandId ?? opKeyOf(req, body),
      p_deal_id: body.dealId, p_expected_version: body.expectedVersion, p_quote_id: body.quoteId,
      p_decision_id: body.decisionId, p_attempt: 1, p_op_key: opKeyOf(req, body),
    });
    if (error) {
      if (/stale|expired|invalid|mismatch|insufficient|exceeds|not accepted|verification|not found|locked/i.test(error.message)) return err(error.message, /stale|expired/i.test(error.message) ? 409 : 422);
      throw error;
    }
    return json(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Execute failed", statusOf(e));
  }
}

// GET ?commandId= → durable receipt (refresh-safe; proves one effect per command).
export async function GET(req: Request) {
  try {
    const commandId = new URL(req.url).searchParams.get("commandId");
    if (!commandId) return err("commandId required");
    const { data, error } = await supabase().from("command_receipts").select("command_id,deal_id,plan_hash,result,created_at").eq("command_id", commandId).single();
    if (error || !data) return err("Receipt not found", 404);
    return json({ receipt: data });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
