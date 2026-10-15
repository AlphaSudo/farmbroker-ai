import { supabase } from "./supabase";
import { captureOrder, verifyCapture, getRefund, refundCapture } from "./paypal";
import { saveVerifiedCapture } from "./domain/payments";
import { saveProviderRefund } from "./domain/refunds";
import { recordEvent } from "./domain/events";

export async function reconcileDeal(dealId: string, captureApproved = false) {
  const sb = supabase();
  const attempts = await sb.from("payment_attempts").select("*").eq("deal_id", dealId).in("status", ["created", "approved", "capture_pending", "captured"]);
  if (attempts.error) throw attempts.error;
  const notes: string[] = [];
  let pending = false;
  for (const a of attempts.data ?? []) {
    if (!a.provider_order_id) continue;
    const verify = () => verifyCapture(a.provider_order_id, (Number(a.usd_minor) / 100).toFixed(2), process.env.PAYPAL_MERCHANT_EMAIL ?? "", dealId);
    let proof = await verify();
    if (!proof.ok && proof.status === "APPROVED" && proof.reason === "no capture on order" && captureApproved) {
      const deal = await sb.from("deals").select("status,outcome,accepted_quote_id").eq("id", dealId).single();
      if (deal.error) throw deal.error;
      if (deal.data.status !== "quoted" || deal.data.outcome !== "pending" || deal.data.accepted_quote_id !== a.quote_revision_id) throw new Error("Approved capture contract changed");
      await captureOrder(a.provider_order_id, a.capture_key);
      proof = await verify();
    }
    if (proof.ok) { await saveVerifiedCapture(a.id, a.provider_order_id, proof); notes.push("Capture verified and reconciled."); }
    else { notes.push("Capture not verified: " + proof.reason); if (proof.status === "PENDING") pending = true; }
  }
  const refunds = await sb.from("refunds").select("*").eq("deal_id", dealId).in("status", ["requested", "pending", "needs_review"]);
  if (refunds.error) throw refunds.error;
  for (const r of refunds.data ?? []) {
    if (r.lease_until && new Date(r.lease_until).getTime() > Date.now()) continue;
    if (!r.provider_refund_id && Date.now() - new Date(r.created_at).getTime() > 6 * 3600000) {
      notes.push("Unknown refund outside conservative retry window; operator review required."); continue;
    }
    const provider = r.provider_refund_id ? await getRefund(r.provider_refund_id) : await refundCapture(r.capture_id, (Number(r.usd_minor) / 100).toFixed(2), r.op_key);
    if (provider.amount?.currency_code !== "USD" || provider.amount.value !== (Number(r.usd_minor) / 100).toFixed(2)) throw new Error("Refund amount/currency binding mismatch");
    await saveProviderRefund(r.id, provider);
    notes.push("Refund " + provider.status.toLowerCase() + " reconciled.");
    if (provider.status === "PENDING") pending = true;
  }
  return { notes, pending };
}

// Only verified inbox entries reach this function. Provider GETs recheck the
// financial binding; the signed event alone never assigns a paid/refunded state.
export async function processProviderEvent(eventId: string) {
  const sb = supabase();
  const row = await sb.from("paypal_events").select("*").eq("event_id", eventId).single();
  if (row.error || !row.data) throw new Error("Provider event not found");
  if (!row.data.verified_by) throw new Error("Provider event has no verified provenance");
  if (row.data.processed === "processed") return { replayed: true };
  const event = row.data.payload as { event_type: string; resource?: { id?: string; custom_id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } };
  const resource = event.resource ?? {};
  let note = "No matching local operation";
  if (event.event_type === "PAYMENT.CAPTURE.REFUNDED" && resource.id) {
    const refund = await sb.from("refunds").select("deal_id").eq("provider_refund_id", resource.id).maybeSingle();
    if (refund.error) throw refund.error;
    if (refund.data) { await reconcileDeal(refund.data.deal_id); note = "Refund reconciled"; }
    else throw new Error("Refund event awaits local operation correlation");
  } else {
    const orderId = event.event_type === "CHECKOUT.ORDER.APPROVED" ? resource.id : resource.supplementary_data?.related_ids?.order_id;
    if (orderId) {
      const attempt = await sb.from("payment_attempts").select("id,deal_id").eq("provider_order_id", orderId).maybeSingle();
      if (attempt.error) throw attempt.error;
      if (attempt.data) {
        if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
          const updated = await sb.from("payment_attempts").update({ status: "approved" }).eq("id", attempt.data.id).eq("status", "created");
          if (updated.error) throw updated.error;
          await recordEvent(attempt.data.deal_id, "order_approved", { orderId }, "provider-event:" + eventId);
        }
        if (["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"].includes(event.event_type)) {
          await reconcileDeal(attempt.data.deal_id, event.event_type === "CHECKOUT.ORDER.APPROVED");
        } else await recordEvent(attempt.data.deal_id, "provider_review", { eventId, type: event.event_type }, "provider-event:" + eventId);
        note = "Matching operation reconciled";
      }
    }
  }
  const done = await sb.from("paypal_events").update({ processed: "processed" }).eq("event_id", eventId);
  if (done.error) throw done.error;
  return { processed: true, note };
}
