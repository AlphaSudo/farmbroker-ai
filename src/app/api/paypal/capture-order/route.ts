import { supabase } from "@/lib/supabase";
import { captureOrder } from "@/lib/paypal";
import { json, err } from "@/lib/http";

// POST { orderId } → capture → Deal paid + Request paid.
export async function POST(req: Request) {
  try {
    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) return err("orderId required");
    const { orderId: id, captureId } = await captureOrder(orderId);
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*").eq("paypal_order_id", id).single();
    if (error || !deal) return err("Deal not found for order", 404);
    await sb.from("deals").update({ paypal_capture_id: captureId, status: "paid" }).eq("id", deal.id);
    await sb.from("buyer_requests").update({ status: "paid" }).eq("id", deal.request_id);
    return json({ ok: true, dealId: deal.id, captureId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Capture failed", 500);
  }
}
