import { supabase } from "@/lib/supabase";
import { captureOrder, verifyCapture, egpToUsd } from "@/lib/paypal";
import { assertTransition } from "@/lib/domain/transitions";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import { num } from "@/lib/types";

// POST { orderId } → capture + FULL verification (COMPLETED/amount/currency/payee) before paid.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { orderId?: string; opKey?: string };
    if (!body.orderId) return err("orderId required");
    const sb = supabase();
    const { data: attempt, error } = await sb.from("payment_attempts").select("*, deals!inner(*)").eq("provider_order_id", body.orderId).maybeSingle();
    if (error || !attempt) return err("Unknown payment attempt — capture rejected.", 404);
    const a = attempt as unknown as { id: string; deal_id: string; usd_minor: number; status: string; deals: { request_id: string; status: string; total_price: number } };
    const request = await loadRequest(a.deals.request_id);
    await assertBuyer(req, request);
    if (a.status === "captured") {
      const { data: deal } = await sb.from("deals").select("paypal_capture_id").eq("id", a.deal_id).single();
      return json({ ok: true, dealId: a.deal_id, captureId: (deal as { paypal_capture_id: string } | null)?.paypal_capture_id, replayed: true });
    }
    const merchant = process.env.PAYPAL_MERCHANT_EMAIL ?? "";
    const expectedUsd = egpToUsd(num(a.deals.total_price));
    const { orderId: id } = await captureOrder(body.orderId);
    const v = await verifyCapture(id, expectedUsd, merchant);
    if (!v.ok) {
      await sb.from("payment_attempts").update({ status: "failed" }).eq("id", a.id);
      return err(`Capture verification failed: ${v.reason}. Order NOT marked paid.`, 422);
    }
    assertTransition("deals", a.deals.status, "paid");
    const u1 = await sb.from("payment_attempts").update({ status: "captured" }).eq("id", a.id).eq("status", a.status);
    if (u1.error) throw u1.error;
    await sb.from("deals").update({ paypal_order_id: id, paypal_capture_id: v.captureId, status: "paid", paypal_verified: { captureId: v.captureId, amount: v.amount, currency: v.currency, payee: v.payeeEmail, verifiedAt: new Date().toISOString() } }).eq("id", a.deal_id).eq("status", a.deals.status);
    await sb.from("buyer_requests").update({ status: "paid" }).eq("id", a.deals.request_id);
    await sb.from("ledger_entries").insert({ deal_id: a.deal_id, kind: "capture_receipt", usd_minor: a.usd_minor, note: `Sandbox capture ${v.captureId}` });
    await recordEvent(a.deal_id, "payment_verified", { captureId: v.captureId, amount: v.amount, currency: v.currency }, opKeyOf(req, body));
    return json({ ok: true, dealId: a.deal_id, captureId: v.captureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Capture failed", statusOf(e));
  }
}
