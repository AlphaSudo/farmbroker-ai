import { supabase } from "@/lib/supabase";
import { acceptRevision } from "@/lib/domain/revisions";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import { num } from "@/lib/types";

// POST { requestId } → accept ONE revision version. Paid deals are locked (no scope change here).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { requestId?: string; opKey?: string };
    if (!body.requestId) return err("requestId required");
    const sb = supabase();
    const request = await loadRequest(body.requestId);
    await assertBuyer(req, request);
    const rev = await acceptRevision(id, body.requestId);
    const snap = (rev as { snapshot?: { clearing?: number } }).snapshot ?? {};
    const clearing = Number(snap.clearing ?? num((rev as { per_kg: number }).per_kg));
    const qty = Math.round(num((rev as { total_minor: number }).total_minor) / 100 / num((rev as { per_kg: number }).per_kg));
    const supplierCost = Math.round(clearing * qty);
    const total = num((rev as { total_minor: number }).total_minor) / 100;
    const { data: existing } = await sb.from("deals").select("*").eq("request_id", body.requestId).maybeSingle();
    let deal = existing;
    if (!existing) {
      const { data, error } = await sb.from("deals").insert({
        request_id: body.requestId, total_price: total, supplier_cost: supplierCost, margin: total - supplierCost,
        per_kg: num((rev as { per_kg: number }).per_kg), clearing_per_kg: clearing, status: "quoted", accepted_quote_id: id,
      }).select("*").single();
      if (error) throw error;
      deal = data;
    } else {
      const ex = existing as { status: string };
      if (ex.status !== "quoted") throw Object.assign(new Error(`Deal is ${ex.status} — terms locked after payment.`), { status: 409 });
      const { error } = await sb.from("deals").update({ total_price: total, supplier_cost: supplierCost, margin: total - supplierCost, per_kg: num((rev as { per_kg: number }).per_kg), clearing_per_kg: clearing, accepted_quote_id: id }).eq("id", (existing as { id: string }).id);
      if (error) throw error;
      deal = { ...(existing as object), total_price: total, accepted_quote_id: id };
    }
    await sb.from("buyer_requests").update({ status: "quoted", accepted_quote_id: id }).eq("id", body.requestId);
    await recordEvent((deal as { id: string }).id, "quote_revision_accepted", { revision: id }, opKeyOf(req, body));
    return json({ deal, revision: rev });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Accept failed", statusOf(e));
  }
}
