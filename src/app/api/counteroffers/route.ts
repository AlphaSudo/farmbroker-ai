import { supabase } from "@/lib/supabase";
import { eligibleSuppliers } from "@/lib/domain/eligibility";
import { createRevision } from "@/lib/domain/revisions";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

// POST { requestId, offered } → structured counteroffer. Accepted/countered offers persist
// a draft revision; NOTHING is agreed until the buyer explicitly accepts that revision.
export async function POST(req: Request) {
  try {
    const { requestId, offered } = (await req.json()) as { requestId?: string; offered?: number };
    if (!requestId || !Number.isFinite(offered)) return err("requestId + offered required");
    const request = await loadRequest(requestId);
    await assertBuyer(req, request);
    if (!["open", "quoted"].includes(request.status)) return err("Negotiation closed after payment.", 422);
    const { data: suppliers } = await supabase().from("suppliers").select("*").eq("pool", request.pool);
    const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], {
      crop: request.crop, pool: request.pool, delivery_days: request.delivery_days, requested_at: request.created_at,
    });
    if (!sel.eligible.length) return err("No eligible supply.", 422);
    const floor = Math.max(...sel.eligible.map((s) => num(s.min_price)));
    const max = num(request.max_price);
    const offer = num(offered);
    let decision: "accepted" | "countered" | "refused";
    let price: number | null = null;
    let reason = "";
    if (offer < floor) {
      decision = "countered";
      price = Math.round(((offer + floor + 0.5) / 2) * 10) / 10;
      reason = `Below floor ${floor} EGP/kg — server counteroffer ${price} EGP/kg.`;
    } else if (offer > max) {
      decision = "refused";
      reason = `Above your max ${max} EGP/kg — no revision created. Reduce quantity or extend the deadline.`;
    } else {
      decision = "accepted";
      price = offer;
      reason = `Fits floor ${floor} and your max ${max} — revision drafted for explicit acceptance.`;
    }
    let revision = null;
    if (price !== null) {
      revision = await createRevision(requestId, {
        per_kg: price, quantity_kg: request.quantity_kg, delivery_days: request.delivery_days,
        snapshot: { crop: request.crop, pool: request.pool, counteroffer: true, floor },
      });
      await supabase().from("counteroffers").insert({ request_id: requestId, revision_id: (revision as { id: string }).id, offered_per_kg: offer, decision, counter_per_kg: decision === "countered" ? price : null, reason });
    }
    return json({ decision, price, reason, revisionId: revision ? (revision as { id: string }).id : null });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
