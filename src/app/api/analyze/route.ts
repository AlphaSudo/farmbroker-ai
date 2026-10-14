import { supabase } from "@/lib/supabase";
import { riskAgent } from "@/lib/agents/risk";
import { json, err, poolOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";

// POST { requestId } → Demand (already structured at create) + Risk → saves analysis. Buyer-blind: no supplier names.
export async function POST(req: Request) {
  try {
    const { requestId } = (await req.json()) as { requestId?: string };
    if (!requestId) return err("requestId required");
    const pool = poolOf(req.url);
    const sb = supabase();
    const { data: request, error: rErr } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
    if (rErr || !request) return err("Request not found", 404);
    const { data: suppliers, error: sErr } = await sb.from("suppliers").select("*").eq("pool", pool);
    if (sErr) throw sErr;
    const analysis = riskAgent(request, (suppliers ?? []) as Supplier[]);
    await sb.from("buyer_requests").update({ analysis }).eq("id", requestId);
    const log = [
      `Demand Agent: parsed { crop: "${request.crop}", quantity: "${request.quantity_kg} tons", delivery: "${request.delivery_days} days" }.`,
      `Risk Agent: ${analysis.available_kg.toLocaleString()}kg across ${analysis.supplier_count} suppliers → confidence ${analysis.confidence}% (${analysis.risk_level} risk).`,
    ];
    return json({ analysis, log });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Analysis failed", 500);
  }
}
