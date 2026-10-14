import { supabase } from "@/lib/supabase";
import { qualityAgent, DEMO_INSPECTION } from "@/lib/agents/quality";
import { json, err } from "@/lib/http";
import { num } from "@/lib/types";

// POST { dealId } → grade ALL allocations with demo values (video shortcut).
export async function POST(req: Request) {
  try {
    const { dealId } = (await req.json()) as { dealId?: string };
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: allocs, error } = await sb.from("allocations").select("*").eq("deal_id", dealId);
    if (error) throw error;
    let accepted = 0, partial = 0, rejected = 0;
    for (const a of allocs ?? []) {
      const d = qualityAgent({ allocated_kg: num(a.allocated_kg), weight_received_kg: num(a.allocated_kg), ...DEMO_INSPECTION });
      await sb.from("allocations").update({
        weight_received_kg: num(a.allocated_kg), moisture_pct: DEMO_INSPECTION.moisture_pct,
        visual_score: DEMO_INSPECTION.visual_score, condition: DEMO_INSPECTION.condition,
        inspection_status: d.decision, quality_grade: d.grade, usable_kg: d.usable_kg,
      }).eq("id", a.id);
      if (d.decision === "passed") accepted++; else if (d.decision === "partial") partial++; else rejected++;
    }
    return json({ accepted, partial, rejected });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Approve-all failed", 500);
  }
}
