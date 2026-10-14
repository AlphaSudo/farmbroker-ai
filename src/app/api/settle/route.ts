import { supabase } from "@/lib/supabase";
import { financeAgent } from "@/lib/agents/finance";
import { json, err } from "@/lib/http";
import type { Allocation, Deal } from "@/lib/types";

// Settle a paid+covered deal whose allocations are all graded. Buyer view anonymizes names.
export async function settle(dealId: string, view: string) {
  const sb = supabase();
  const { data: deal, error } = await sb.from("deals").select("*").eq("id", dealId).single();
  if (error || !deal) throw new Error("Deal not found");
  if (!["paid", "procuring", "covered", "settled"].includes(deal.status)) throw new Error("Settle only after payment + procurement");
  const { data: allocs, error: aErr } = await sb.from("allocations").select("*, supplier:suppliers(*)").eq("deal_id", dealId);
  if (aErr) throw aErr;
  const list = (allocs ?? []) as unknown as Allocation[];
  if (list.length === 0) throw new Error("No allocations yet");
  if (list.some((a) => a.inspection_status === "pending")) throw new Error("Complete inspection first");
  const settlement = financeAgent(deal as Deal, list);
  for (const p of settlement.payouts) {
    await sb.from("allocations").update({ payout_status: "calculated" }).eq("deal_id", dealId).eq("supplier_id", p.supplier_id);
  }
  await sb.from("deals").update({ status: "settled" }).eq("id", dealId);
  await sb.from("buyer_requests").update({ status: "settled" }).eq("id", (deal as Deal).request_id);
  if (view === "buyer") {
    const sorted = [...settlement.payouts].sort((a, b) => b.kg - a.kg);
    return { ...settlement, payouts: sorted.map((p, i) => ({ ...p, supplier_name: `Supplier ${String.fromCharCode(65 + i)}` })) };
  }
  return settlement;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const dealId = u.searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    return json(await settle(dealId, u.searchParams.get("view") ?? "buyer"));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Settle failed", e instanceof Error && /inspection|payment|procurement/i.test(e.message) ? 403 : 500);
  }
}

export async function POST(req: Request) {
  try {
    const { dealId } = (await req.json()) as { dealId?: string };
    if (!dealId) return err("dealId required");
    return json(await settle(dealId, new URL(req.url).searchParams.get("view") ?? "buyer"));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Settle failed", e instanceof Error && /inspection|payment|procurement/i.test(e.message) ? 403 : 500);
  }
}
