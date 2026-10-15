import { supabase } from "@/lib/supabase";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";

// GET ?dealId= → redacted decision→quote→capture→receipt chain (owner-scoped).
// Supplier identities, briefs, and secrets never appear; lot refs are truncated.
export async function GET(req: Request) {
  try {
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal } = await sb.from("deals").select("id,request_id,status,outcome,total_price,per_kg,paypal_capture_id,accepted_quote_id").eq("id", dealId).single();
    if (!deal) return err("Deal not found", 404);
    const d = deal as { request_id: string };
    await assertBuyer(req, await loadRequest(d.request_id));
    const [runs, quotes, receipts, events] = await Promise.all([
      sb.from("agent_runs").select("id,kind,status,policy_version,snapshot,created_at").eq("request_id", d.request_id).order("created_at", { ascending: false }).limit(5),
      sb.from("quote_revisions").select("id,version,per_kg,total_minor,expires_at,status").eq("request_id", d.request_id).order("version", { ascending: false }).limit(5),
      sb.from("command_receipts").select("command_id,plan_hash,result,created_at").eq("deal_id", dealId),
      sb.from("deal_events").select("type,created_at").eq("deal_id", dealId).order("created_at"),
    ]);
    const { data: decisions } = await sb.from("decision_records").select("id,model,prompt_version,policy_version,plan_hash,expires_at,status,created_at").eq("request_id", d.request_id).order("created_at", { ascending: false }).limit(5);
    return json({ deal, runs: runs.data ?? [], decisions: decisions ?? [], quotes: quotes.data ?? [], receipts: receipts.data ?? [], events: events.data ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
