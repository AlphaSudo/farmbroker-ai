import { supabase } from "@/lib/supabase";
import { captureApprovedOrder } from "@/lib/paypal";
import { saveVerifiedCapture } from "@/lib/domain/payments";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json() as { orderId?: string };
    if (!orderId) return err("orderId required");
    const sb = supabase();
    const result = await sb.from("payment_attempts").select("*, deals!inner(*)").eq("provider_order_id", orderId).maybeSingle();
    if (result.error || !result.data) return err("Unknown payment attempt - capture rejected.", 404);
    const a = result.data;
    await assertBuyer(req, await loadRequest(a.deals.request_id));
    if (a.status === "captured") return json({ ok: true, dealId: a.deal_id, captureId: a.deals.paypal_capture_id, replayed: true });
    if (!["created", "approved", "capture_pending"].includes(a.status) || a.deals.status !== "quoted") return err("Payment attempt is no longer active.", 409);
    if (a.deals.outcome !== "pending" || a.deals.accepted_quote_id !== a.quote_revision_id) return err("Payment contract changed; capture rejected.", 409);
    const merchant = process.env.PAYPAL_MERCHANT_EMAIL ?? "";
    if (!merchant) return err("Payment merchant is not configured.", 503);
    const expected = (Number(a.usd_minor) / 100).toFixed(2);
    const proof = await captureApprovedOrder(orderId, expected, merchant, a.deal_id, a.capture_key);
    const saved = await saveVerifiedCapture(a.id, orderId, proof);
    return json({ ok: true, dealId: a.deal_id, captureId: proof.captureId, replayed: saved?.replayed ?? false });
  } catch (e) { return err(e instanceof Error ? e.message : "Capture failed", statusOf(e)); }
}
