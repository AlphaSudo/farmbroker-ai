import { supabase } from "@/lib/supabase";
import { financeAgent } from "@/lib/agents/finance";
import { assertTransition } from "@/lib/domain/transitions";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { buyerSettlement } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";
import type { Allocation, Deal } from "@/lib/types";
import { num } from "@/lib/types";

async function graded(dealId: string) {
  const sb = supabase();
  const { data: deal, error } = await sb.from("deals").select("*").eq("id", dealId).single();
  if (error || !deal) throw Object.assign(new Error("Deal not found"), { status: 404 });
  const { data: allocs, error: aErr } = await sb.from("allocations").select("*, supplier:suppliers(*)").eq("deal_id", dealId);
  if (aErr) throw aErr;
  return { deal: deal as unknown as Deal & { request_id: string }, list: (allocs ?? []) as unknown as Allocation[] };
}

const acceptedKg = (list: Allocation[]): number =>
  list.reduce((s, a) => s + (a.inspection_status === "passed" ? num(a.allocated_kg) : a.inspection_status === "partial" ? Math.min(num(a.usable_kg ?? 0), num(a.allocated_kg)) : 0), 0);

// GET ?dealId= → READ-ONLY preview. Never mutates (1.1).
export async function GET(req: Request) {
  try {
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const { deal, list } = await graded(dealId);
    const request = await loadRequest(deal.request_id);
    await assertBuyer(req, request);
    const pending = list.some((a) => a.inspection_status === "pending");
    const accepted = acceptedKg(list);
    if (pending || list.length === 0) {
      return json({ ready: false, reason: "Complete inspection first", accepted_kg: accepted, target_kg: request.quantity_kg });
    }
    const settlement = financeAgent(deal, list);
    return json({ ready: accepted >= num(request.quantity_kg), accepted_kg: accepted, target_kg: request.quantity_kg, preview: true, ...buyerSettlement(settlement) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}

// POST { dealId } → guarded settlement. Partial/rejected-short orders stay unresolved (no completion, no profit).
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { dealId?: string; opKey?: string };
    if (!body.dealId) return err("dealId required");
    const { deal, list } = await graded(body.dealId);
    const request = await loadRequest(deal.request_id);
    await assertBuyer(req, request);
    if (list.length === 0 || list.some((a) => a.inspection_status === "pending")) return err("Complete inspection first", 403);
    const accepted = acceptedKg(list);
    if (accepted < num(request.quantity_kg)) {
      return err(`Unresolved shortage: ${accepted.toLocaleString()}/${num(request.quantity_kg).toLocaleString()}kg accepted. Recovery or refund required — this order cannot complete.`, 403);
    }
    if (!["procuring", "covered"].includes(deal.status)) return err(`Deal is ${deal.status}`, 409);
    const settlement = financeAgent(deal, list);
    const sb = supabase();
    for (const p of settlement.payouts) {
      await sb.from("allocations").update({ payout_status: "calculated" }).eq("deal_id", body.dealId).eq("supplier_id", p.supplier_id);
    }
    assertTransition("deals", deal.status, "settled");
    await sb.from("deals").update({ status: "settled", outcome: "pending" }).eq("id", body.dealId).eq("status", deal.status);
    await sb.from("buyer_requests").update({ status: "settled" }).eq("id", deal.request_id);
    await recordEvent(body.dealId, "settlement_calculated", { total: settlement.total, margin: settlement.margin, accepted_kg: accepted }, opKeyOf(req, body));
    return json(buyerSettlement(settlement));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Settle failed", statusOf(e));
  }
}
