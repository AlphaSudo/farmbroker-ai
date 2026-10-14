import { supabase } from "@/lib/supabase";
import { procurementAgent } from "@/lib/agents/procurement";
import { json, err, poolOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

async function progress(sb: ReturnType<typeof supabase>, dealId: string, view: string) {
  const { data: deal } = await sb.from("deals").select("*, buyer_requests!inner(quantity_kg)").eq("id", dealId).single();
  const { data: allocs } = await sb.from("allocations").select("*, supplier:suppliers(*)").eq("deal_id", dealId);
  const list = (allocs ?? []) as Array<{ allocated_kg: number; supplier?: Supplier; supplier_id: string; inspection_status: string }>;
  const covered = list.reduce((s, a) => s + num(a.allocated_kg), 0);
  const target = deal ? num((deal as unknown as { buyer_requests: { quantity_kg: number } }).buyer_requests.quantity_kg) : 0;
  if (view === "hub") return { deal, target, covered, remaining: Math.max(0, target - covered), locks: list.map((a) => ({ kg: num(a.allocated_kg), name: a.supplier?.name ?? "Supplier" })) };
  return { deal, target, covered, remaining: Math.max(0, target - covered), supplier_count: list.length };
}

// GET ?dealId=&view=hub → progress. Buyer view: counts only, zero names.
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const dealId = u.searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    return json(await progress(supabase(), dealId, u.searchParams.get("view") ?? "buyer"));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", 500);
  }
}

// POST { dealId } → run Procurement. GR#3: 403 unless deal is paid. Idempotent.
export async function POST(req: Request) {
  try {
    const { dealId } = (await req.json()) as { dealId?: string };
    if (!dealId) return err("dealId required");
    const pool = poolOf(req.url);
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*, buyer_requests!inner(*)").eq("id", dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    if (deal.status !== "paid") return err("Pay first — procurement starts only after PayPal payment (GR#3).", 403);
    const { data: existing } = await sb.from("allocations").select("id").eq("deal_id", dealId);
    if (existing && existing.length > 0) return json({ ...(await progress(sb, dealId, "hub")), reused: true });
    const request = (deal as unknown as { buyer_requests: { crop: string; quantity_kg: number } }).buyer_requests;
    const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", pool);
    const list = ((suppliers ?? []) as Supplier[]).filter((s) => s.crop.toLowerCase() === request.crop.toLowerCase());
    const plan = procurementAgent({ quantity_kg: num(request.quantity_kg) } as never, list);
    if (plan.allocations.length > 0) {
      const { error: iErr } = await sb.from("allocations").insert(plan.allocations.map((a) => ({ deal_id: dealId, supplier_id: a.supplier_id, allocated_kg: a.allocated_kg, cost: a.cost, payout_status: "pending" })));
      if (iErr) throw iErr;
    }
    const status = plan.covered ? "covered" : "short";
    await sb.from("deals").update({ status }).eq("id", dealId);
    await sb.from("buyer_requests").update({ status: plan.covered ? "procuring" : "short" }).eq("id", deal.request_id);
    const log = plan.allocations.map((a, i) => `Procurement Agent: lock ${i + 1}/${plan.allocations.length} — ${a.allocated_kg.toLocaleString()}kg (running total ${(plan.allocations.slice(0, i + 1).reduce((s, x) => s + x.allocated_kg, 0)).toLocaleString()}kg).`);
    return json({ ...(await progress(sb, dealId, "hub")), covered: plan.covered, log });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Procurement failed", 500);
  }
}
