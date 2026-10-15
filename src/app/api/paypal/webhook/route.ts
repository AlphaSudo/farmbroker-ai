import { supabase } from "@/lib/supabase";
import { getAccessToken, getRefund } from "@/lib/paypal";
import { verifyNativeSignature } from "@/lib/paypal-signature";
import { recordEvent } from "@/lib/domain/events";
import { json, err, statusOf } from "@/lib/http";

// POST /api/paypal/webhook — authenticity BEFORE trust/dedupe (2.3).
// ?mode=native (default) | postback | compare (both + agreement logged).
// Seen-but-unprocessed events resume; only completed work replays.
export async function POST(req: Request) {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return err("Webhooks not configured (PAYPAL_WEBHOOK_ID missing).", 503);
    const raw = await req.text();
    const event = JSON.parse(raw) as { id?: string; event_type?: string; resource?: Record<string, unknown> };
    if (!event.id || !event.event_type) return err("Malformed event", 400);
    const mode = new URL(req.url).searchParams.get("mode") ?? "native";
    const native = await verifyNativeSignature({
      transmissionId: req.headers.get("paypal-transmission-id"),
      transmissionTime: req.headers.get("paypal-transmission-time"),
      certUrl: req.headers.get("paypal-cert-url"),
      authAlgo: req.headers.get("paypal-auth-algo"),
      signature: req.headers.get("paypal-transmission-sig"),
      webhookId, rawBody: raw,
    });
    let authentic = native.ok;
    let method = "native";
    if (mode !== "native") {
      const access = await getAccessToken();
      const verify = await fetch("https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature", {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          transmission_id: req.headers.get("paypal-transmission-id"),
          transmission_time: req.headers.get("paypal-transmission-time"),
          cert_url: req.headers.get("paypal-cert-url"),
          auth_algo: req.headers.get("paypal-auth-algo"),
          transmission_sig: req.headers.get("paypal-transmission-sig"),
          webhook_id: webhookId, webhook_event: event,
        }),
      });
      const { verification_status } = (await verify.json()) as { verification_status?: string };
      const postback = verification_status === "SUCCESS";
      if (mode === "compare" && postback !== native.ok) {
        console.warn("webhook method disagreement", { event: event.id, native: native.ok, postback, reason: native.reason });
      }
      if (mode === "postback") { authentic = postback; method = "postback"; }
      if (mode === "compare") method = `native+postback:${native.ok === postback ? "agree" : "DISAGREE"}`;
    }
    if (!authentic) return err(`Invalid webhook signature (${native.reason ?? "postback rejected"})`, 401);
    const sb = supabase();
    const { data: seen } = await sb.from("paypal_events").select("id,processed").eq("event_id", event.id).maybeSingle();
    if (seen && (seen as { processed: string }).processed === "processed") return json({ ok: true, replayed: true });
    if (!seen) await sb.from("paypal_events").insert({ event_id: event.id, type: event.event_type, payload: { ...event, verified_by: method }, processed: "received" });
    const resource = event.resource ?? {};
    if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
      const orderId = resource.id as string | undefined;
      if (orderId) {
        const { data: attempt } = await sb.from("payment_attempts").select("deal_id").eq("provider_order_id", orderId).maybeSingle();
        if (attempt) {
          await sb.from("payment_attempts").update({ status: "approved" }).eq("provider_order_id", orderId).eq("status", "created");
          await recordEvent((attempt as { deal_id: string }).deal_id, "order_approved", { orderId });
        }
      }
    }
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const custom = resource.custom_id as string | undefined;
      if (custom) await recordEvent(custom, "capture_event", { event: event.id });
    }
    if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      const refundId = (resource.id as string | undefined) ?? "";
      if (refundId) {
        const current = await getRefund(refundId).catch(() => null);
        const { data: row } = await sb.from("refunds").select("id,deal_id").eq("provider_refund_id", refundId).maybeSingle();
        if (row) {
          const r = row as { id: string; deal_id: string };
          if (current?.status === "COMPLETED") {
            await sb.from("refunds").update({ status: "completed" }).eq("id", r.id);
            await recordEvent(r.deal_id, "refunded", { refundId, via: "webhook" });
          }
        }
      }
    }
    await sb.from("paypal_events").update({ processed: "processed" }).eq("event_id", event.id);
    return json({ ok: true });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Webhook failed", statusOf(e));
  }
}
