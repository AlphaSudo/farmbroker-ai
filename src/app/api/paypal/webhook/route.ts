import { supabase } from "@/lib/supabase";
import { getAccessToken } from "@/lib/paypal";
import { verifyNativeSignature } from "@/lib/paypal-signature";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// POST /api/paypal/webhook — authenticity BEFORE trust/dedupe (2.3).
// ?mode=native (default) | postback | compare (both + agreement logged).
// Seen-but-unprocessed events resume; only completed work replays.
export async function POST(req: Request) {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return err("Webhooks not configured (PAYPAL_WEBHOOK_ID missing).", 503);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 524288) return err("Event too large", 413);
    const event = JSON.parse(raw) as { id?: string; event_type?: string; resource?: Record<string, unknown> };
    if (!event.id || !event.event_type) return err("Malformed event", 400);
    const mode = (hubAuthorized(req) ? new URL(req.url).searchParams.get("mode") : null) ?? process.env.PAYPAL_WEBHOOK_VERIFY_MODE ?? "native";
    if (!["native", "postback", "compare"].includes(mode)) throw new Error("Invalid webhook verification mode");
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
        method: "POST", signal: AbortSignal.timeout(15000),
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
      if (!verify.ok) throw new Error("PayPal signature postback unavailable");
      const { verification_status } = (await verify.json()) as { verification_status?: string };
      const postback = verification_status === "SUCCESS";
      if (mode === "compare" && postback !== native.ok) {
        console.warn("webhook method disagreement", { event: event.id, native: native.ok, postback, reason: native.reason });
      }
      if (mode === "postback") { authentic = postback; method = "postback"; }
      if (mode === "compare") method = `native+postback:${native.ok === postback ? "agree" : "DISAGREE"}`;
    }
    if (!authentic) return err(`Invalid webhook signature (${native.reason ?? "postback rejected"})`, 401);
    const saved = await supabase().rpc("ingest_paypal_event", { p_event: event, p_method: method });
    if (saved.error) throw saved.error;
    return json({ ...saved.data, queued: !saved.data?.replayed });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Webhook failed", statusOf(e));
  }
}
