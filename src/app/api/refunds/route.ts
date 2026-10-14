import { supabase } from "@/lib/supabase";
import { refundCapture, getRefund } from "@/lib/paypal";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";
import { num } from "@/lib/types";

async function withDeal(dealId: string) {
  const sb = supabase();
  const { data: deal, error } = await sb.from("deals").select("*").eq("id", dealId).single();
  if (error || !deal) throw Object.assign(new Error("Deal not found"), { status: 404 });
  return { sb, deal: deal as { id: string; request_id: string; total_price: number; paypal_capture_id: string | null; status: string; outcome: string } };
}

// GET ?dealId= → refund states (owner or Hub). Only provider-confirmed completion displays "Refunded".
export async function GET(req: Request) {
  try {
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const { sb, deal } = await withDeal(dealId);
    await assertBuyer(req, await loadRequest(deal.request_id));
    const { data } = await sb.from("refunds").select("*").eq("deal_id", dealId).order("created_at");
    return json({ refunds: data ?? [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}

// POST { dealId, reason, opKey? } (Hub) → policy-gated FULL sandbox refund. Capped at capture.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const body = (await req.json()) as { dealId?: string; reason?: string; opKey?: string };
    if (!body.dealId || !body.reason?.trim()) return err("dealId + reason required");
    const opKey = opKeyOf(req, body);
    const { sb, deal } = await withDeal(body.dealId);
    if (!deal.paypal_capture_id) return err("No capture to refund.", 422);
    const { data: dup } = await sb.from("refunds").select("id,status").eq("op_key", opKey).maybeSingle();
    if (dup) return json({ refund: dup, replayed: true });
    const { data: prior } = await sb.from("refunds").select("id").eq("deal_id", body.dealId).in("status", ["requested", "pending", "completed"]);
    if (prior && prior.length > 0) return err("A refund is already in flight/completed for this capture (cap enforced).", 409);
    const { data: incident } = await sb.from("shortage_incidents").select("status").eq("deal_id", body.dealId).in("status", ["refund_eligible"]).limit(1).maybeSingle();
    const eligible = !!incident || ["short"].includes(deal.status);
    if (!eligible) return err("Refund policy: only unresolved-shortage or Hub-reviewed orders qualify.", 422);
    const usd = (num(deal.total_price) / 48).toFixed(2);
    const { data: row, error } = await sb.from("refunds").insert({
      deal_id: body.dealId, capture_id: deal.paypal_capture_id, usd_minor: Math.round(Number(usd) * 100),
      status: "requested", reason: body.reason.trim(), policy_version: "v1", op_key: opKey,
    }).select("*").single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        const { data: r2 } = await sb.from("refunds").select("*").eq("op_key", opKey).single();
        return json({ refund: r2, replayed: true });
      }
      throw error;
    }
    const r = row as { id: string };
    try {
      const pr = await refundCapture(deal.paypal_capture_id, usd, opKey);
      await sb.from("refunds").update({ status: pr.status === "COMPLETED" ? "completed" : "pending", provider_refund_id: pr.id }).eq("id", r.id);
      await sb.from("ledger_entries").insert({ deal_id: body.dealId, kind: "refund", usd_minor: Math.round(Number(usd) * 100), note: `Sandbox refund ${pr.id}` });
      if (pr.status === "COMPLETED") {
        await sb.from("deals").update({ outcome: "refunded" }).eq("id", body.dealId);
        await sb.from("shortage_incidents").update({ status: "refunded" }).eq("deal_id", body.dealId).in("status", ["refund_eligible", "open", "recovering"]);
        await recordEvent(body.dealId, "refunded", { refundId: pr.id }, `${opKey}:event`);
      }
    } catch (pe) {
      await sb.from("refunds").update({ status: "needs_review" }).eq("id", r.id);
      await recordEvent(body.dealId, "refund_needs_review", { error: String(pe) }, `${opKey}:event`);
    }
    const { data: final } = await sb.from("refunds").select("*").eq("id", r.id).single();
    void getRefund;
    return json({ refund: final });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Refund failed", statusOf(e));
  }
}
