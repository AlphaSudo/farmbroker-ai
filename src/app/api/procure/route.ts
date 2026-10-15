import { supabase } from "@/lib/supabase";
import { procurementAgent } from "@/lib/agents/procurement";
import { availableSupply } from "@/lib/domain/supply";
import { committedKg } from "@/lib/domain/coverage";
import { openIncident } from "@/lib/recovery/service";
import { assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { buyerProgress } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";
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
    const { data: allocs } = await sb.from("allocations").select("allocated_kg,inspection_status,usable_kg,weight_received_kg").eq("deal_id", dealId);
    const covered = (allocs ?? []).reduce((s, a) => s + committedKg(a), 0);
    return json({ ...buyerProgress(num(request.quantity_kg), covered, (allocs ?? []).length), status: (deal as { status: string }).status });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}

// POST { dealId, decisionId?, quoteId?, commandId?, opKey? } → bound execute when a
// decision is supplied (2.2); legacy cheapest-first otherwise (provenance manual).
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { dealId?: string; decisionId?: string; quoteId?: string; commandId?: string; opKey?: string };
    if (!body.dealId) return err("dealId required");
    const opKey = opKeyOf(req, body);
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*, buyer_requests!inner(*)").eq("id", body.dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    const d = deal as unknown as { id: string; status: string; request_id: string; version?: number; paypal_verified: unknown; accepted_quote_id?: string; buyer_requests: { owner_token: string; crop: string; quantity_kg: number; pool: string; delivery_days: number; created_at: string; fixture_id?: string | null } };
    await assertBuyer(req, d.buyer_requests);
    if (!d.paypal_verified) return err("Pay first — procurement starts only after verified PayPal capture.", 403);
    const accepted = await sb.from("quote_revisions").select("snapshot").eq("id", d.accepted_quote_id ?? "").maybeSingle();
    if (accepted.error) throw accepted.error;
    const boundDecision = accepted.data?.snapshot?.decision_id as string | undefined;
    const decisionId = body.decisionId ?? boundDecision;
    if (boundDecision && decisionId !== boundDecision) return err("Decision differs from accepted quote", 409);
    if (decisionId) {
      const commandId = body.commandId ?? body.opKey ?? req.headers.get("Idempotency-Key") ?? `procure:${d.id}:${decisionId}`;
      const { data: prior, error: priorError } = await sb.from("command_receipts").select("expected_version").eq("command_id", commandId).eq("deal_id", d.id).maybeSingle();
      if (priorError) throw priorError;
      const { data: rpc, error: rpcErr } = await sb.rpc("execute_bound_plan", {
        p_command_id: commandId, p_deal_id: body.dealId,
        p_expected_version: prior?.expected_version ?? (d.version ?? 1), p_quote_id: body.quoteId ?? d.accepted_quote_id, p_decision_id: decisionId,
        p_attempt: 1, p_op_key: opKey,
      });
      if (rpcErr) {
        if (/stale|expired|invalid|mismatch|insufficient|exceed|not accepted|verification|not found/i.test(rpcErr.message)) return err(rpcErr.message, 409);
        throw rpcErr;
      }
      const r = rpc as { kg: number; cost: number; plan_hash: string; command: string };
      const { count, error: countError } = await sb.from("allocations").select("id", { count: "exact", head: true }).eq("deal_id", body.dealId);
      if (countError) throw countError;
      return json({ ...buyerProgress(num(d.buyer_requests.quantity_kg), Number(r.kg), count ?? 0), status: "procuring", fully_covered: true, bound: true, plan_hash: r.plan_hash, command: r.command, log: ["Bound plan executed: stored AI decision → committed items (hash matches receipt)."] });
    }
    const { data: existing } = await sb.from("allocations").select("allocated_kg,inspection_status,usable_kg,weight_received_kg").eq("deal_id", body.dealId);
    if (existing && existing.length > 0) {
      const covered = existing.reduce((s, a) => s + committedKg(a), 0);
      return json({ ...buyerProgress(num(d.buyer_requests.quantity_kg), covered, existing.length), status: d.status, reused: true });
    }
    const sel = await availableSupply(d.buyer_requests);
    const plan = procurementAgent({ quantity_kg: num(d.buyer_requests.quantity_kg) }, sel.eligible);
    if (!plan.covered) { await openIncident(body.dealId, `short:${body.dealId}`); return err("Insufficient free stock. Recovery or refund review required.", 409); }
    const attempt = 1;
    const { data: rpc, error: rpcErr } = await sb.rpc("reserve_paid_plan", {
      p_deal_id: body.dealId, p_request_id: d.request_id, p_attempt: attempt, p_op_key: opKey,
      p_items: plan.allocations.map((a) => ({ supplier_id: a.supplier_id, kg: a.allocated_kg, cost: a.cost })),
    });
    if (rpcErr) {
      if (/insufficient|paid verification/i.test(rpcErr.message)) return err(rpcErr.message, 409);
      throw rpcErr;
    }
    const req2 = d.buyer_requests.quantity_kg;
    try {
      const { recordDecision } = await import("@/lib/ai/decisions");
      await recordDecision({
        runId: null, requestId: d.request_id,
        selection: { candidate_id: "legacy-cost-first", justification: "Legacy cheapest-first execution without a model run (provenance manual)." },
        candidates: [{ id: "legacy-cost-first", strategy: "cost-first", items: plan.allocations.map((a) => ({ supplier_id: a.supplier_id, kg: a.allocated_kg, rate: 0 })), total_kg: plan.covered_kg, cost_total: 0 }],
        model: null,
      });
    } catch { /* audit continuity is best-effort; the reservation already committed */ }
    return json({
      ...buyerProgress(num(req2), plan.covered_kg, plan.allocations.length),
      status: plan.covered ? "procuring" : "short", fully_covered: plan.covered,
      replayed: (rpc as { replayed?: boolean })?.replayed ?? false,
      log: ["Procurement Agent: atomic paid reservation committed (rows locked, rechecked, written together)."],
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Procurement failed", statusOf(e));
  }
}
