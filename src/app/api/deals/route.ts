import { supabase } from "@/lib/supabase";
import { pricingAgent } from "@/lib/agents/pricing";
import { riskAgent } from "@/lib/agents/risk";
import { availableSupply } from "@/lib/domain/supply";
import { eligibleKg } from "@/lib/domain/eligibility";
import { createRevision, acceptRevision } from "@/lib/domain/revisions";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { buyerDeal } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json() as { requestId?: string };
    if (!requestId) return err("requestId required");
    const request = await loadRequest(requestId);
    await assertBuyer(req, request);
    const existing = await supabase().from("deals").select("*").eq("request_id", requestId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return json({ deal: buyerDeal(existing.data) });
    const sel = await availableSupply(request);
    if (eligibleKg(sel) < Number(request.quantity_kg)) return err("Insufficient eligible on-time supply - cannot sell this promise.", 422);
    const quote = pricingAgent(request, riskAgent(request, sel.eligible), sel.eligible);
    if (!quote.quotable || quote.per_kg > Number(request.max_price)) return err("Over budget or not quotable.", 422);
    const revision = await createRevision(requestId, { per_kg: quote.per_kg, quantity_kg: Number(request.quantity_kg), delivery_days: Number(request.delivery_days), snapshot: { standard: true } });
    const accepted = await acceptRevision(revision.id, requestId);
    return json({ deal: buyerDeal(accepted.deal) }, 201);
  } catch (e) { return err(e instanceof Error ? e.message : "Deal failed", statusOf(e)); }
}
