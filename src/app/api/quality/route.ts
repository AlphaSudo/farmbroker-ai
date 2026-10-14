import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { qualityAgent } from "@/lib/agents/quality";
import { recordEvent } from "@/lib/domain/events";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";
import { num } from "@/lib/types";

const Grade = z.object({
  allocationId: z.string().uuid(),
  weight_received_kg: z.coerce.number().min(0),
  moisture_pct: z.coerce.number().min(0).max(100),
  visual_score: z.coerce.number().int().min(1).max(5),
  condition: z.enum(["Good", "Fair", "Wet", "Damaged"]),
  opKey: z.string().optional(),
});

// GET ?dealId= → owner sees anonymized shares; Hub sees names. No cross-owner access.
export async function GET(req: Request) {
  try {
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("request_id").eq("id", dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    const request = await loadRequest((deal as { request_id: string }).request_id);
    const role = await assertBuyer(req, request);
    const { data, error: qErr } = await sb.from("allocations").select("id, allocated_kg, inspection_status, quality_grade, usable_kg, supplier:suppliers(id,name)").eq("deal_id", dealId);
    if (qErr) throw qErr;
    return json({
      allocations: (data ?? []).map((a) => {
        const r = a as { id: string; allocated_kg: number; inspection_status: string; quality_grade: string | null; usable_kg: number | null; supplier?: { name?: string } };
        return role === "hub"
          ? { id: r.id, allocated_kg: num(r.allocated_kg), inspection_status: r.inspection_status, quality_grade: r.quality_grade, usable_kg: r.usable_kg, name: r.supplier?.name ?? "Supplier" }
          : { id: r.id, allocated_kg: num(r.allocated_kg), inspection_status: r.inspection_status, quality_grade: r.quality_grade, usable_kg: r.usable_kg, name: "FarmBroker Supply Network share" };
      }),
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}

// POST → Hub only. Grades one lot + appends immutable inspection evidence.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const parsed = Grade.safeParse(await req.json());
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid inspection input");
    const sb = supabase();
    const { data: alloc, error } = await sb.from("allocations").select("*").eq("id", parsed.data.allocationId).single();
    if (error || !alloc) return err("Allocation not found", 404);
    const a = alloc as { allocated_kg: number; deal_id: string; attempt?: number };
    const d = qualityAgent({ allocated_kg: num(a.allocated_kg), weight_received_kg: parsed.data.weight_received_kg, moisture_pct: parsed.data.moisture_pct, visual_score: parsed.data.visual_score, condition: parsed.data.condition });
    const opKey = opKeyOf(req, parsed.data);
    const { error: iErr } = await sb.from("inspections").insert({
      allocation_id: a === null ? "" : parsed.data.allocationId, attempt: (a.attempt ?? 1),
      weight_received_kg: parsed.data.weight_received_kg, usable_kg: d.usable_kg, moisture_pct: parsed.data.moisture_pct,
      visual_score: parsed.data.visual_score, condition: parsed.data.condition, decision: d.decision, grade: d.grade, op_key: opKey,
    });
    if (iErr && !/duplicate|unique/i.test(iErr.message)) throw iErr;
    await sb.from("allocations").update({ inspection_status: d.decision, quality_grade: d.grade, usable_kg: d.usable_kg, weight_received_kg: parsed.data.weight_received_kg, moisture_pct: parsed.data.moisture_pct, visual_score: parsed.data.visual_score, condition: parsed.data.condition }).eq("id", parsed.data.allocationId);
    await recordEvent(a.deal_id, "lot_inspected", { allocation: parsed.data.allocationId, decision: d.decision, grade: d.grade, usable_kg: d.usable_kg }, `${opKey}:event`);
    return json({ decision: d.decision, grade: d.grade, usable_kg: d.usable_kg, reasons: d.reasons });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Grading failed", statusOf(e));
  }
}
