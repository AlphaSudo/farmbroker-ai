import { supabase } from "@/lib/supabase";
import { createOrder } from "@/lib/paypal";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { quoteEconomics } from "@/lib/domain/contracts";
import { json, err, statusOf } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { dealId } = await req.json() as { dealId?: string };
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const result = await sb.from("deals").select("*").eq("id", dealId).single();
    if (result.error || !result.data) return err("Deal not found", 404);
    const deal = result.data;
    const request = await loadRequest(deal.request_id);
    await assertBuyer(req, request);
    if (deal.status !== "quoted") return err(`Deal is ${deal.status}, not payable`, 422);
    await quoteEconomics(request, Number(deal.per_kg));
    const claim = await sb.rpc("claim_payment_attempt", { p_deal: dealId });
    if (claim.error) return err(claim.error.message, /expired/.test(claim.error.message) ? 410 : 409);
    const { claimed, attempt } = claim.data as { claimed: boolean; attempt: { id: string; op_key: string; status: string; provider_order_id: string | null; usd_minor: number } };
    if (attempt.provider_order_id) return json({ orderId: attempt.provider_order_id, attemptId: attempt.id, reused: true });
    if (claimed) {
      // This UUID is durable and reused even if the provider response is lost.
      const order = await createOrder(dealId, Number(deal.total_price), attempt.op_key);
      const saved = await sb.from("payment_attempts").update({ provider_order_id: order.id, status: "created", lease_until: null }).eq("id", attempt.id).eq("status", "creating");
      if (saved.error) throw saved.error;
      return json({ orderId: order.id, attemptId: attempt.id });
    }
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const saved = await sb.from("payment_attempts").select("provider_order_id").eq("id", attempt.id).single();
      if (saved.error) throw saved.error;
      if (saved.data.provider_order_id) return json({ orderId: saved.data.provider_order_id, attemptId: attempt.id, reused: true });
    }
    return err("Checkout is still being created. Retry this deal; its payment attempt is preserved.", 409);
  } catch (e) { return err(e instanceof Error ? e.message : "Create order failed", statusOf(e)); }
}
