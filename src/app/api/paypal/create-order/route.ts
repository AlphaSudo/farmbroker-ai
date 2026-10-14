import { supabase } from "@/lib/supabase";
import { createOrder } from "@/lib/paypal";
import { createRevision, acceptRevision } from "@/lib/domain/revisions";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import { num } from "@/lib/types";

// POST { dealId } → one active attempt per contract; budget rechecked; reuse live attempt.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { dealId?: string; opKey?: string };
    if (!body.dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*").eq("id", body.dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    const request = await loadRequest((deal as { request_id: string }).request_id);
    await assertBuyer(req, request);
    const d = deal as { id: string; status: string; total_price: number; per_kg: number };
    if (d.status !== "quoted") return err(`Deal is ${d.status}, not payable`, 422);
    if (num(d.per_kg) > num(request.max_price)) return err(`Deal ${num(d.per_kg)} EGP/kg exceeds your max ${num(request.max_price)} EGP/kg.`, 422);
    // Checkout binds the ACCEPTED revision snapshot — never recomputed terms.
    const qid = (d as { accepted_quote_id?: string }).accepted_quote_id;
    if (qid) {
      const { data: rev } = await sb.from("quote_revisions").select("*").eq("id", qid).single();
      const r = rev as { status: string; expires_at: string; total_minor: number } | null;
      if (!r || r.status !== "accepted") return err("Accepted quote revision missing — re-accept terms.", 409);
      if (new Date(r.expires_at).getTime() < Date.now()) return err("Accepted quote expired — request a fresh revision.", 410);
      if (Math.round(r.total_minor / 100) !== Math.round(num(d.total_price))) return err("Deal total drifted from accepted quote — re-accept terms.", 409);
    } else {
      // One-time legacy bridge for pre-revision deals (event-logged, same totals).
      const revision = await createRevision(request.id, {
        per_kg: num(d.per_kg), quantity_kg: num(request.quantity_kg), delivery_days: num(request.delivery_days),
        snapshot: { legacy_bridge: true },
      });
      await acceptRevision((revision as { id: string }).id, request.id);
      await sb.from("deals").update({ accepted_quote_id: (revision as { id: string }).id }).eq("id", body.dealId);
      await recordEvent(body.dealId, "legacy_terms_bridged", { revision: (revision as { id: string }).id });
    }
    const { data: active } = await sb.from("payment_attempts").select("*").eq("deal_id", body.dealId).in("status", ["created", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (active) return json({ orderId: (active as { provider_order_id: string }).provider_order_id, attemptId: (active as { id: string }).id, reused: true });
    const opKey = opKeyOf(req, body);
    const order = await createOrder(d.id, num(d.total_price), opKey);
    const { data: attempt, error: aErr } = await sb.from("payment_attempts").insert({
      deal_id: body.dealId, usd_minor: Math.round((num(d.total_price) / 48) * 100), status: "created",
      provider_order_id: order.id, op_key: opKey,
    }).select("*").single();
    if (aErr) throw aErr;
    return json({ orderId: order.id, attemptId: (attempt as { id: string }).id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Create order failed", statusOf(e));
  }
}
