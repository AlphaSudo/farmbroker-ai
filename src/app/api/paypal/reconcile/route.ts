import { supabase } from "@/lib/supabase";
import { verifyCapture, getRefund, refundCapture } from "@/lib/paypal";
import { saveVerifiedCapture } from "@/lib/domain/payments";
import { saveProviderRefund } from "@/lib/domain/refunds";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const { dealId } = await req.json() as { dealId?: string };
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const attempts = await sb.from("payment_attempts").select("*").eq("deal_id", dealId).in("status", ["created", "approved", "capture_pending", "captured"]);
    if (attempts.error) throw attempts.error;
    const notes: string[] = [];
    for (const a of attempts.data ?? []) {
      if (!a.provider_order_id) continue;
      const proof = await verifyCapture(a.provider_order_id, (Number(a.usd_minor) / 100).toFixed(2), process.env.PAYPAL_MERCHANT_EMAIL ?? "", dealId);
      if (proof.ok) { await saveVerifiedCapture(a.id, a.provider_order_id, proof); notes.push("Capture verified and local state reconciled."); }
      else notes.push(`Capture not verified: ${proof.reason}`);
    }
    const refunds = await sb.from("refunds").select("*").eq("deal_id", dealId).in("status", ["requested", "pending", "needs_review"]);
    if (refunds.error) throw refunds.error;
    for (const r of refunds.data ?? []) {
      // An unknown response is retried ONLY with the original durable provider key.
      if (r.lease_until && new Date(r.lease_until).getTime() > Date.now()) { notes.push("Refund operation still in progress."); continue; }
      const provider = r.provider_refund_id ? await getRefund(r.provider_refund_id) : await refundCapture(r.capture_id, (Number(r.usd_minor) / 100).toFixed(2), r.op_key);
      await saveProviderRefund(r.id, provider);
      notes.push(`Refund ${provider.status.toLowerCase()} reconciled.`);
    }
    return json({ notes });
  } catch (e) { return err(e instanceof Error ? e.message : "Reconcile failed", statusOf(e)); }
}
