import { supabase } from "@/lib/supabase";
import { createOrder } from "@/lib/paypal";
import { json, err } from "@/lib/http";
import { num } from "@/lib/types";

// POST { dealId } → PayPal Orders v2 create (payee = platform, USD demo conversion).
export async function POST(req: Request) {
  try {
    const { dealId } = (await req.json()) as { dealId?: string };
    if (!dealId) return err("dealId required");
    const { data: deal, error } = await supabase().from("deals").select("*").eq("id", dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    if (deal.status !== "quoted") return err(`Deal is ${deal.status}, not payable`, 422);
    const order = await createOrder(deal.id, num(deal.total_price));
    await supabase().from("deals").update({ paypal_order_id: order.id }).eq("id", dealId);
    return json({ orderId: order.id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Create order failed", 500);
  }
}
