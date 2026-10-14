import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { qualityAgent } from "@/lib/agents/quality";
import { json, err } from "@/lib/http";
import { num } from "@/lib/types";

const Grade = z.object({
  allocationId: z.string().uuid(),
  weight_received_kg: z.coerce.number().positive(),
  moisture_pct: z.coerce.number().min(0).max(100),
  visual_score: z.coerce.number().int().min(1).max(5),
  condition: z.enum(["Good", "Fair", "Wet", "Damaged"]),
});

// GET ?dealId= → hub-internal allocation list with supplier names (never buyer-linked).
export async function GET(req: Request) {
  try {
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const { data, error } = await supabase()
      .from("allocations").select("id, allocated_kg, inspection_status, quality_grade, supplier:suppliers(id,name)")
      .eq("deal_id", dealId);
    if (error) throw error;
    return json({ allocations: (data ?? []).map((a) => ({ ...(a as object), name: ((a as { supplier?: { name?: string } }).supplier?.name ?? "Supplier") })) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", 500);
  }
}
export async function POST(req: Request) {
  try {
    const parsed = Grade.safeParse(await req.json());
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid inspection input");
    const sb = supabase();
    const { data: alloc, error } = await sb.from("allocations").select("*").eq("id", parsed.data.allocationId).single();
    if (error || !alloc) return err("Allocation not found", 404);
    const d = qualityAgent({ allocated_kg: num(alloc.allocated_kg), ...parsed.data });
    const { error: uErr } = await sb.from("allocations").update({
      weight_received_kg: parsed.data.weight_received_kg, moisture_pct: parsed.data.moisture_pct,
      visual_score: parsed.data.visual_score, condition: parsed.data.condition,
      inspection_status: d.decision, quality_grade: d.grade, usable_kg: d.usable_kg,
    }).eq("id", alloc.id);
    if (uErr) throw uErr;
    return json({ decision: d.decision, grade: d.grade, usable_kg: d.usable_kg, reasons: d.reasons });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Grading failed", 500);
  }
}
