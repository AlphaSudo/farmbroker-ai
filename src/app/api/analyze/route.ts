import { supabase } from "@/lib/supabase";
import { riskAgent } from "@/lib/agents/risk";
import { eligibleKg } from "@/lib/domain/eligibility";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import { availableSupply } from "@/lib/domain/supply";

// POST { requestId } → Demand + Risk over the request's PERSISTED pool/scenario.
// Hard feasibility: eligible on-time kg must cover the target, else not quotable.
export async function POST(req: Request) {
  try {
    const { requestId } = (await req.json()) as { requestId?: string };
    if (!requestId) return err("requestId required");
    const sb = supabase();
    const request = await loadRequest(requestId);
    await assertBuyer(req, request);
    const sel = await availableSupply(request);
    const analysis = riskAgent(request, sel.eligible);
    if (eligibleKg(sel) < request.quantity_kg) {
      analysis.quotable = false;
      analysis.reasons = [`Only ${eligibleKg(sel).toLocaleString()}kg of ${request.quantity_kg.toLocaleString()}kg is eligible on time — this order cannot be sold as guaranteed supply.`];
    }
    await sb.from("buyer_requests").update({ analysis }).eq("id", requestId);
    const log = [
      `Demand Agent: parsed { crop: "${request.crop}", quantity: "${request.quantity_kg} tons", delivery: "${request.delivery_days} days" } from persisted pool=${request.pool}, scenario=${request.scenario}.`,
      `Risk Agent: ${analysis.available_kg.toLocaleString()}kg eligible across ${analysis.supplier_count} lots (${sel.excluded.length} excluded, ${sel.assumedOnTime} dateless assumed on-time per fixture policy) → confidence ${analysis.confidence}% (${analysis.risk_level}).`,
    ];
    return json({ analysis, log });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Analysis failed", statusOf(e));
  }
}
