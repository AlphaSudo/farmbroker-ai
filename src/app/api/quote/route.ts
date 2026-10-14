import { supabase } from "@/lib/supabase";
import { pricingAgent } from "@/lib/agents/pricing";
import { riskAgent } from "@/lib/agents/risk";
import { eligibleSuppliers, eligibleKg } from "@/lib/domain/eligibility";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

// POST { requestId } → quote preview (no persistence). Priced from the ELIGIBLE set only.
export async function POST(req: Request) {
  try {
    const { requestId } = (await req.json()) as { requestId?: string };
    if (!requestId) return err("requestId required");
    const sb = supabase();
    const request = await loadRequest(requestId);
    await assertBuyer(req, request);
    const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", request.pool);
    const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], {
      crop: request.crop, pool: request.pool, delivery_days: request.delivery_days, requested_at: request.created_at,
    });
    const analysis = riskAgent(request, sel.eligible);
    if (eligibleKg(sel) < request.quantity_kg) {
      return json({ quote: { ...pricingAgent(request, analysis, sel.eligible), quotable: false, reason: "Insufficient eligible on-time supply — no guaranteed quote." }, log: ["Pricing Agent: blocked — coverage shortfall."] });
    }
    const quote = pricingAgent(request, analysis, sel.eligible);
    if (quote.quotable && quote.per_kg > num(request.max_price)) {
      quote.quotable = false;
      quote.reason = `Quote ${quote.per_kg} EGP/kg exceeds your max ${num(request.max_price)} EGP/kg.`;
    }
    const log = quote.quotable
      ? [
          `Pricing Agent: eligible floor ${quote.min_cost_floor.toLocaleString()} EGP, clearing ${quote.clearing_per_kg}/kg (wrong-crop/late lots excluded).`,
          `Pricing Agent: quote ${quote.per_kg}/kg × ${quote.quantity_kg.toLocaleString()}kg = ${quote.total.toLocaleString()} EGP (margin ${quote.margin.toLocaleString()}).`,
        ]
      : [`Pricing Agent: blocked — ${quote.reason}`];
    return json({ quote, log });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Quote failed", statusOf(e));
  }
}
