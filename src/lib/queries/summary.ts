// Buyer order summary builder (2.7) — one server-composed read shared by the
// summary endpoint and projection jobs. No supplier identities, costs, or contacts.
import { supabase } from "../supabase";
import { buyerDeal } from "../serializers/buyer";
import { num } from "../types";
import { acceptedKg, committedKg } from "../domain/coverage";

const LABELS: Record<string, string> = {
  quote_accepted: "Quote accepted", plan_reserved: "Supply plan reserved", plan_executed: "Supply plan executed",
  payment_verified: "PayPal payment verified", order_approved: "PayPal order approved", lot_inspected: "Lot inspected",
  settlement_calculated: "Settlement calculated", handover_simulated: "Handover recorded", shortage_opened: "Shortage opened",
  recovery_committed: "Recovery committed", refunded: "Order refunded", capture_event: "PayPal capture event",
};

export async function buildSummary(requestId: string) {
  const sb = supabase();
  const { data: request, error } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
  if (error || !request) throw Object.assign(new Error("Request not found"), { status: 404 });
  const req = request as { quantity_kg: number };
  const { owner_token: _o, ...safe } = request as Record<string, unknown>;
  void _o;
  const { data: deal } = await sb.from("deals").select("*").eq("request_id", requestId).maybeSingle();
  let progress = null as null | { target: number; covered: number; accepted: number; remaining: number };
  let events: Array<{ label: string; created_at: string }> = [];
  let version = `${request.status}`;
  if (deal) {
    const d = deal as { id: string };
    const al = await sb.from("allocations").select("allocated_kg,inspection_status,usable_kg,weight_received_kg").eq("deal_id", d.id);
    if (al.error) throw al.error;
    const covered = (al.data ?? []).reduce((s, a) => s + committedKg(a), 0);
    const accepted = (al.data ?? []).reduce((s, a) => s + acceptedKg(a), 0);
    progress = { target: num(req.quantity_kg), covered, accepted, remaining: Math.max(0, num(req.quantity_kg) - covered) };
    const { data: ev, error: eventError, count } = await sb.from("deal_events").select("type,created_at", { count: "exact" }).eq("deal_id", d.id).order("created_at", { ascending: false }).limit(30);
    if (eventError) throw eventError;
    version = `${(deal as { version?: number }).version ?? 1}:${count ?? 0}:${(deal as { status: string }).status}:${(deal as { outcome?: string }).outcome ?? "pending"}`;
    events = ((ev ?? []) as Array<{ type: string; created_at: string }>).map((e) => ({ label: LABELS[e.type] ?? e.type, created_at: e.created_at }));
  }
  return { request: safe, deal: deal ? buyerDeal(deal as never) : null, progress, events, version };
}
