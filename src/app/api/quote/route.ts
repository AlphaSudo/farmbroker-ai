import { supabase } from "@/lib/supabase";
import { pricingAgent } from "@/lib/agents/pricing";
import { riskAgent } from "@/lib/agents/risk";
import { json, err, poolOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";

// POST { requestId } → compute quote (no persistence). Buyer-blind aggregates only.
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
    const analysis = riskAgent(request, list);
    const quote = pricingAgent(request, analysis, list);
    const log = quote.quotable
      ? [
          `Pricing Agent: min-cost floor ${quote.min_cost_floor.toLocaleString()} EGP, clearing ${quote.clearing_per_kg}/kg.`,
          `Pricing Agent: quote ${quote.per_kg}/kg × ${quote.quantity_kg.toLocaleString()}kg = ${quote.total.toLocaleString()} EGP (margin ${quote.margin.toLocaleString()}).`,
        ]
      : [`Pricing Agent: blocked — ${quote.reason}`];
    return json({ quote, log });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Quote failed", 500);
  }
}
