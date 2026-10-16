import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { platformExposure } from "@/lib/finance/exposure";
import { json, err, statusOf } from "@/lib/http";

// GET ?dealId= → full Hub deal view: verified evidence, attempts, ledger, refunds, outcome.
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*").eq("id", dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    const [attempts, ledger, refunds, events] = await Promise.all([
      sb.from("payment_attempts").select("id,status,usd_minor,provider_order_id,created_at").eq("deal_id", dealId),
      sb.from("ledger_entries").select("kind,egp_minor,usd_minor,note,created_at").eq("deal_id", dealId).order("created_at"),
      sb.from("refunds").select("id,status,usd_minor,provider_refund_id,reason,created_at").eq("deal_id", dealId),
      sb.from("deal_events").select("type,payload,created_at").eq("deal_id", dealId).order("created_at"),
    ]);
    for (const result of [attempts, ledger, refunds, events]) if (result.error) throw result.error;
    const { data: allocs } = await sb.from("allocations").select("usable_kg,allocated_kg,inspection_status,entitlement_rate,entitlement_minor,cost").eq("deal_id", dealId);
    let acceptedObligations = 0;
    for (const a of (allocs ?? []) as Array<{ usable_kg: number | null; allocated_kg: number; inspection_status: string; entitlement_rate: number | null; entitlement_minor: number | null; cost: number }>) {
      if (a.inspection_status !== "passed" && a.inspection_status !== "partial") continue;
      const usable = Math.min(Number(a.usable_kg ?? a.allocated_kg), Number(a.allocated_kg));
      acceptedObligations += a.entitlement_minor ?? Math.round(usable * Number(a.entitlement_rate ?? (Number(a.allocated_kg) > 0 ? Number(a.cost) / Number(a.allocated_kg) : 0)) * 100);
    }
    const refundRows = (refunds.data ?? []) as Array<{ status: string; usd_minor: number }>;
    const pendingRefunds = refundRows.filter((r) => ["requested", "pending", "needs_review"].includes(r.status)).reduce((s, r) => s + Number(r.usd_minor), 0);
    const completedRefunds = refundRows.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.usd_minor), 0);
    const verified = (deal as { paypal_verified?: { amount?: string } | null }).paypal_verified;
    const exposure = platformExposure({
      acceptedObligationsMinor: acceptedObligations, pendingRefundsUsdMinor: pendingRefunds, completedRefundsUsdMinor: completedRefunds,
      capturedUsdMinor: verified?.amount ? Math.round(Number(verified.amount) * 100) : 0, fxEgpPerUsd: 48,
    });
    return json({ deal, attempts: attempts.data ?? [], ledger: ledger.data ?? [], refunds: refunds.data ?? [], events: events.data ?? [], entitlementsMinor: acceptedObligations, exposure });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
