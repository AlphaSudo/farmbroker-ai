import { supabase } from "@/lib/supabase";
import { pricingAgent } from "@/lib/agents/pricing";
import { riskAgent } from "@/lib/agents/risk";
import { eligibleSuppliers, eligibleKg } from "@/lib/domain/eligibility";
import { createRevision } from "@/lib/domain/revisions";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

// POST { requestId } → validated draft revision (30-min expiry, supply snapshot). Nonbinding until accepted.
export async function POST(req: Request) {
  try {
    const { requestId } = (await req.json()) as { requestId?: string };
    if (!requestId) return err("requestId required");
    const request = await loadRequest(requestId);
    await assertBuyer(req, request);
    const { data: suppliers } = await supabase().from("suppliers").select("*").eq("pool", request.pool);
    const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], {
      crop: request.crop, pool: request.pool, delivery_days: request.delivery_days, requested_at: request.created_at,
    });
    if (eligibleKg(sel) < request.quantity_kg) return err("Insufficient eligible supply — no revision.", 422);
    const quote = pricingAgent(request, riskAgent(request, sel.eligible), sel.eligible);
    if (!quote.quotable || quote.per_kg > num(request.max_price)) return err("Over budget or not quotable.", 422);
    const revision = await createRevision(requestId, {
      per_kg: quote.per_kg, quantity_kg: request.quantity_kg, delivery_days: request.delivery_days,
      snapshot: { crop: request.crop, pool: request.pool, eligible_kg: eligibleKg(sel), lots: sel.eligible.length, clearing: quote.clearing_per_kg, market_range: quote.market_range },
    });
    return json({ revision }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
