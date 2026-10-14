import { supabase } from "@/lib/supabase";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";

const LABELS: Record<string, string> = {
  quote_accepted: "Quote accepted", plan_reserved: "Supply plan reserved", payment_verified: "PayPal payment verified",
  order_approved: "PayPal order approved", lot_inspected: "Lot inspected", hub_approve_all: "Hub inspection batch",
  settlement_calculated: "Settlement calculated", handover_simulated: "Simulated handover recorded",
  shortage_opened: "Shortage opened", recovery_committed: "Recovery committed", refunded: "Order refunded",
  refund_needs_review: "Refund needs review", reconciled_paid: "Payment reconciled", capture_event: "PayPal capture event",
  legacy_terms_bridged: "Quote terms bridged",
};

// GET ?dealId= → chronological persisted timeline, readable labels (owner-scoped).
export async function GET(req: Request) {
  try {
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal } = await sb.from("deals").select("request_id").eq("id", dealId).single();
    if (!deal) return err("Deal not found", 404);
    const role = await assertBuyer(req, await loadRequest((deal as { request_id: string }).request_id));
    const { data } = await sb.from("deal_events").select("type,payload,created_at").eq("deal_id", dealId).order("created_at");
    return json({ events: ((data ?? []) as Array<{ type: string; payload: object; created_at: string }>).map((e) => ({ ...e, payload: role === "hub" ? e.payload : {}, label: LABELS[e.type] ?? e.type })) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
