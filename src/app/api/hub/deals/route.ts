import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// GET ?dealId= → full Hub deal view: verified evidence, attempts, ledger, refunds, outcome.
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*").eq("id", dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    const [attempts, ledger, refunds, events] = await Promise.all([
      sb.from("payment_attempts").select("id,status,usd_minor,provider_order_id,created_at").eq("deal_id", dealId),
      sb.from("ledger_entries").select("kind,egp_minor,usd_minor,note,created_at").eq("deal_id", dealId).order("created_at"),
      sb.from("refunds").select("id,status,usd_minor,provider_refund_id,reason,created_at").eq("deal_id", dealId),
      sb.from("deal_events").select("type,payload,created_at").eq("deal_id", dealId).order("created_at"),
    ]);
    return json({ deal, attempts: attempts.data ?? [], ledger: ledger.data ?? [], refunds: refunds.data ?? [], events: events.data ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
