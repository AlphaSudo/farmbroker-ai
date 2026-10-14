import { supabase } from "@/lib/supabase";
import { verifyCapture } from "@/lib/paypal";
import { recordEvent } from "@/lib/domain/events";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// POST { dealId } (Hub) → converge local payment state against provider truth. Never creates charges.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const { dealId } = (await req.json()) as { dealId?: string };
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal } = await sb.from("deals").select("*").eq("id", dealId).single();
    if (!deal) return err("Deal not found", 404);
    const d = deal as { paypal_order_id: string | null; total_price: number };
    const notes: string[] = [];
    if (d.paypal_order_id) {
      const v = await verifyCapture(d.paypal_order_id, (Number(d.total_price) / 48).toFixed(2), process.env.PAYPAL_MERCHANT_EMAIL ?? "");
      notes.push(v.ok ? `capture ${v.captureId} COMPLETED, amount/currency/payee verified` : `capture NOT verified: ${v.reason}`);
      if (v.ok) {
        await sb.from("payment_attempts").update({ status: "captured" }).eq("provider_order_id", d.paypal_order_id);
        await recordEvent(dealId, "reconciled_paid", { captureId: v.captureId });
      }
    } else notes.push("no provider order recorded");
    const { data: refunds } = await sb.from("refunds").select("id,status,provider_refund_id").eq("deal_id", dealId);
    return json({ notes, refunds: refunds ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Reconcile failed", statusOf(e));
  }
}
