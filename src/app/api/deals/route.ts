import { supabase } from "@/lib/supabase";
import { pricingAgent } from "@/lib/agents/pricing";
import { riskAgent } from "@/lib/agents/risk";
import { eligibleSuppliers, eligibleKg } from "@/lib/domain/eligibility";
import { createRevision, acceptRevision } from "@/lib/domain/revisions";
import { assertTransition } from "@/lib/domain/transitions";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

// POST { requestId } → accept quote: budget-enforced, persisted deal. Idempotent per request.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { requestId?: string; opKey?: string };
    if (!body.requestId) return err("requestId required");
    const sb = supabase();
    const request = await loadRequest(body.requestId);
    await assertBuyer(req, request);
    assertTransition("buyer_requests", request.status, "quoted");
    const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", request.pool);
    const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], {
      crop: request.crop, pool: request.pool, delivery_days: request.delivery_days, requested_at: request.created_at,
    });
    if (eligibleKg(sel) < request.quantity_kg) return err("Insufficient eligible on-time supply — cannot sell this promise.", 422);
    const quote = pricingAgent(request, riskAgent(request, sel.eligible), sel.eligible);
    if (!quote.quotable) return err(quote.reason ?? "Not quotable", 422);
    if (quote.per_kg > num(request.max_price)) return err(`Quote ${quote.per_kg} EGP/kg exceeds your max ${num(request.max_price)} EGP/kg.`, 422);
    const { data: existing } = await sb.from("deals").select("*").eq("request_id", body.requestId).maybeSingle();
    if (existing) return json({ deal: existing });
    const revision = await createRevision(body.requestId, {
      per_kg: quote.per_kg, quantity_kg: request.quantity_kg, delivery_days: request.delivery_days,
      snapshot: { standard: true, clearing: quote.clearing_per_kg, market_range: quote.market_range },
    });
    await acceptRevision((revision as { id: string }).id, body.requestId);
    const { data: deal, error: dErr } = await sb
      .from("deals")
      .insert({ request_id: body.requestId, total_price: quote.total, supplier_cost: quote.supplier_cost, margin: quote.margin, per_kg: quote.per_kg, clearing_per_kg: quote.clearing_per_kg, status: "quoted", accepted_quote_id: (revision as { id: string }).id })
      .select("*").single();
    if (dErr) throw dErr;
    const r1 = await sb.from("buyer_requests").update({ status: "quoted" }).eq("id", body.requestId).eq("status", "open");
    if (r1.error) throw r1.error;
    await recordEvent((deal as { id: string }).id, "quote_accepted", { total: quote.total, per_kg: quote.per_kg, pool: request.pool }, opKeyOf(req, body));
    return json({ deal }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Deal failed", statusOf(e));
  }
}
