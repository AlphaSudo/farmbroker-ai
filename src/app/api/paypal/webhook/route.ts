import { supabase } from "@/lib/supabase";
import { getAccessToken } from "@/lib/paypal";
import { recordEvent } from "@/lib/domain/events";
import { json, err, statusOf } from "@/lib/http";

// POST /api/paypal/webhook — verified PayPal events, deduped, routed through the domain reducer.
// Requires PAYPAL_WEBHOOK_ID; without it the route reports unconfigured (503), never trusts payloads.
export async function POST(req: Request) {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return err("Webhooks not configured (PAYPAL_WEBHOOK_ID missing).", 503);
    const raw = await req.text();
    const event = JSON.parse(raw) as { id?: string; event_type?: string; resource?: Record<string, unknown> };
    if (!event.id || !event.event_type) return err("Malformed event", 400);
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
    if (verification_status !== "SUCCESS") return err("Invalid webhook signature", 401);
    const sb = supabase();
    const { data: seen } = await sb.from("paypal_events").select("id,processed").eq("event_id", event.id).maybeSingle();
    if (seen) return json({ ok: true, replayed: true });
    await sb.from("paypal_events").insert({ event_id: event.id, type: event.event_type, payload: event, processed: "received" });
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
    await sb.from("paypal_events").update({ processed: "processed" }).eq("event_id", event.id);
    return json({ ok: true });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Webhook failed", statusOf(e));
  }
}
