import { supabase } from "@/lib/supabase";
import { pricingAgent } from "@/lib/agents/pricing";
import { riskAgent } from "@/lib/agents/risk";
import { json, err, poolOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";

// POST { requestId } → approve pricing: persist deal (quoted) + request → quoted. Idempotent.
export async function POST(req: Request) {
  try {
    const { requestId } = (await req.json()) as { requestId?: string };
    if (!requestId) return err("requestId required");
    const pool = poolOf(req.url);
    const sb = supabase();
    const { data: request, error } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
    if (error || !request) return err("Request not found", 404);
    const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", pool);
    const list = (suppliers ?? []) as Supplier[];
    const quote = pricingAgent(request, riskAgent(request, list), list);
    if (!quote.quotable) return err(quote.reason ?? "Not quotable", 422);
    const { data: existing } = await sb.from("deals").select("*").eq("request_id", requestId).maybeSingle();
    if (existing) return json({ deal: existing });
    const { data: deal, error: dErr } = await sb
      .from("deals")
      .insert({ request_id: requestId, total_price: quote.total, supplier_cost: quote.supplier_cost, margin: quote.margin, per_kg: quote.per_kg, clearing_per_kg: quote.clearing_per_kg, status: "quoted" })
      .select("*").single();
    if (dErr) throw dErr;
    await sb.from("buyer_requests").update({ status: "quoted" }).eq("id", requestId);
    return json({ deal }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Deal failed", 500);
  }
}
