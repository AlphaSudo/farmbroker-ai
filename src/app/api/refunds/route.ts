import { supabase } from "@/lib/supabase";
import { refundCapture } from "@/lib/paypal";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";
import { refundAmount, saveProviderRefund } from "@/lib/domain/refunds";

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
    const { sb, deal } = await withDeal(body.dealId);
    if (!deal.paypal_capture_id) return err("No capture to refund.", 422);
    const claim = await sb.rpc("claim_full_refund", { p_deal: body.dealId, p_reason: body.reason.trim() });
    if (claim.error) return err(claim.error.message, 422);
    const { claimed, refund } = claim.data;
    if (!claimed) return json({ refund, replayed: true });
    try {
      const amount = refundAmount(Number(refund.usd_minor));
      const provider = await refundCapture(refund.capture_id, (amount / 100).toFixed(2), refund.op_key);
      return json({ refund: await saveProviderRefund(refund.id, provider) });
    } catch (e) {
      const saved = await sb.from("refunds").update({ status: "needs_review", lease_until: null }).eq("id", refund.id).neq("status", "completed");
      if (saved.error) throw saved.error;
      await recordEvent(body.dealId, "refund_needs_review", { reason: "Provider result requires reconciliation." }, `review:${refund.id}`);
      return err(e instanceof Error ? e.message : "Refund requires reconciliation", 502);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Refund failed", statusOf(e));
  }
}
