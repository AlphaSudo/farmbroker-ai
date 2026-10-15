import { supabase } from "@/lib/supabase";
import { financeAgent } from "@/lib/agents/finance";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { buyerSettlement } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";
import type { Allocation, Deal } from "@/lib/types";
import { num } from "@/lib/types";
import { acceptedKg as acceptedLotKg } from "@/lib/domain/coverage";

async function graded(dealId: string) {
  const sb = supabase();
  const { data: deal, error } = await sb.from("deals").select("*").eq("id", dealId).single();
  if (error || !deal) throw Object.assign(new Error("Deal not found"), { status: 404 });
  const { data: allocs, error: aErr } = await sb.from("allocations").select("*, supplier:suppliers(*)").eq("deal_id", dealId);
  if (aErr) throw aErr;
  return { deal: deal as unknown as Deal & { request_id: string }, list: (allocs ?? []) as unknown as Allocation[] };
}

const acceptedKg = (list: Allocation[]): number => list.reduce((sum, a) => sum + acceptedLotKg(a), 0);

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
    const settlement = financeAgent(deal, list, (deal as { pricing_policy?: string }).pricing_policy);
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
    if (!["procuring", "covered", "short", "settled"].includes(deal.status)) return err(`Deal is ${deal.status}`, 409);
    const settlement = financeAgent(deal, list, (deal as { pricing_policy?: string }).pricing_policy);
    const sb = supabase();
    const completed = await sb.rpc("complete_deal_phase", { p_deal: body.dealId, p_phase: "settle" });
    if (completed.error) return err(completed.error.message, 409);
    return json(buyerSettlement(settlement));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Settle failed", statusOf(e));
  }
}
