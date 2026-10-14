import { supabase } from "@/lib/supabase";
import { qualityAgent, DEMO_INSPECTION } from "@/lib/agents/quality";
import { recordEvent } from "@/lib/domain/events";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";
import { num } from "@/lib/types";

// POST { dealId, opKey? } → Hub demo shortcut. Writes append-only inspection rows.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const { dealId, opKey } = (await req.json()) as { dealId?: string; opKey?: string };
    if (!dealId) return err("dealId required");
    const key = opKey ?? globalThis.crypto.randomUUID();
    const sb = supabase();
    const { data: allocs, error } = await sb.from("allocations").select("*").eq("deal_id", dealId);
    if (error) throw error;
    let accepted = 0, partial = 0, rejected = 0;
    for (const a of (allocs ?? []) as Array<{ id: string; allocated_kg: number; attempt?: number }>) {
      const d = qualityAgent({ allocated_kg: num(a.allocated_kg), weight_received_kg: num(a.allocated_kg), ...DEMO_INSPECTION });
      await sb.from("inspections").insert({
        allocation_id: a.id, attempt: a.attempt ?? 1, weight_received_kg: num(a.allocated_kg), usable_kg: d.usable_kg,
        moisture_pct: DEMO_INSPECTION.moisture_pct, visual_score: DEMO_INSPECTION.visual_score, condition: DEMO_INSPECTION.condition,
        decision: d.decision, grade: d.grade, op_key: `${key}:${a.id}`,
      }).then((r) => { if (r.error && !/duplicate|unique/i.test(r.error.message)) throw r.error; });
      await sb.from("allocations").update({
        weight_received_kg: num(a.allocated_kg), moisture_pct: DEMO_INSPECTION.moisture_pct, visual_score: DEMO_INSPECTION.visual_score,
        condition: DEMO_INSPECTION.condition, inspection_status: d.decision, quality_grade: d.grade, usable_kg: d.usable_kg,
      }).eq("id", a.id);
      if (d.decision === "passed") accepted++; else if (d.decision === "partial") partial++; else rejected++;
    }
    await recordEvent(dealId, "hub_approve_all", { accepted, partial, rejected }, `${key}:event`);
    return json({ accepted, partial, rejected });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Approve-all failed", statusOf(e));
  }
}
