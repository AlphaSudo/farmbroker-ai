import { supabase } from "@/lib/supabase";
import { procurementAgent } from "@/lib/agents/procurement";
import { eligibleSuppliers } from "@/lib/domain/eligibility";
import { assertTransition } from "@/lib/domain/transitions";
import { assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { buyerProgress } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

// GET ?dealId= → buyer progress (aggregates only, zero supplier data).
export async function GET(req: Request) {
  try {
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*, buyer_requests!inner(*)").eq("id", dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    await assertBuyer(req, (deal as unknown as { buyer_requests: { owner_token: string } }).buyer_requests);
    const request = (deal as unknown as { buyer_requests: { quantity_kg: number } }).buyer_requests;
    const { data: allocs } = await sb.from("allocations").select("allocated_kg").eq("deal_id", dealId);
    const covered = (allocs ?? []).reduce((s, a) => s + num((a as { allocated_kg: number }).allocated_kg), 0);
    return json({ ...buyerProgress(num(request.quantity_kg), covered, (allocs ?? []).length), status: (deal as { status: string }).status });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}

// POST { dealId } → atomic reserve via RPC. GR#3: verified PayPal capture required (not a status string).
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { dealId?: string; opKey?: string };
    if (!body.dealId) return err("dealId required");
    const opKey = opKeyOf(req, body);
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*, buyer_requests!inner(*)").eq("id", body.dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    const d = deal as unknown as { id: string; status: string; request_id: string; paypal_verified: unknown; buyer_requests: { owner_token: string; crop: string; quantity_kg: number; pool: string; delivery_days: number; created_at: string } };
    await assertBuyer(req, d.buyer_requests);
    if (!d.paypal_verified) return err("Pay first — procurement starts only after verified PayPal capture.", 403);
    const { data: existing } = await sb.from("allocations").select("allocated_kg").eq("deal_id", body.dealId);
    if (existing && existing.length > 0) {
      const covered = existing.reduce((s, a) => s + num((a as { allocated_kg: number }).allocated_kg), 0);
      return json({ ...buyerProgress(num(d.buyer_requests.quantity_kg), covered, existing.length), status: d.status, reused: true });
    }
    const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", d.buyer_requests.pool);
    const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], {
      crop: d.buyer_requests.crop, pool: d.buyer_requests.pool, delivery_days: d.buyer_requests.delivery_days, requested_at: d.buyer_requests.created_at,
    });
    const plan = procurementAgent({ quantity_kg: num(d.buyer_requests.quantity_kg) }, sel.eligible);
    const attempt = 1;
    const { data: rpc, error: rpcErr } = await sb.rpc("reserve_paid_plan", {
      p_deal_id: body.dealId, p_request_id: d.request_id, p_attempt: attempt, p_op_key: opKey,
      p_items: plan.allocations.map((a) => ({ supplier_id: a.supplier_id, kg: a.allocated_kg, cost: a.cost })),
    });
    if (rpcErr) {
      if (/insufficient|paid verification/i.test(rpcErr.message)) return err(rpcErr.message, 409);
      throw rpcErr;
    }
    const to = plan.covered ? "covered" : "short";
    assertTransition("deals", d.status === "paid" ? "paid" : d.status, to === "covered" ? "procuring" : d.status);
    await sb.from("deals").update({ status: plan.covered ? "procuring" : "short" }).eq("id", body.dealId).eq("status", d.status);
    await sb.from("buyer_requests").update({ status: plan.covered ? "procuring" : "short" }).eq("id", d.request_id);
    const req2 = d.buyer_requests.quantity_kg;
    return json({
      ...buyerProgress(num(req2), plan.covered_kg, plan.allocations.length),
      status: plan.covered ? "procuring" : "short", covered: plan.covered,
      replayed: (rpc as { replayed?: boolean })?.replayed ?? false,
      log: ["Procurement Agent: atomic paid reservation committed (rows locked, rechecked, written together)."],
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Procurement failed", statusOf(e));
  }
}
