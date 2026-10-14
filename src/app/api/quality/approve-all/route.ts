import { supabase } from "@/lib/supabase";
import { DEMO_INSPECTION } from "@/lib/agents/quality";
import { recordEvent } from "@/lib/domain/events";
import { inspectLot } from "@/lib/domain/inspections";
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
    const { data: allocs, error } = await sb.from("allocations").select("*").eq("deal_id", dealId).eq("inspection_status", "pending");
    if (error) throw error;
    let accepted = 0, partial = 0, rejected = 0;
    for (const a of (allocs ?? []) as Array<{ id: string; allocated_kg: number; attempt?: number }>) {
      const d = await inspectLot(a.id, { weight_received_kg: num(a.allocated_kg), ...DEMO_INSPECTION }, `${key}:${a.id}`);
      if (d.decision === "passed") accepted++; else if (d.decision === "partial") partial++; else rejected++;
    }
    await recordEvent(dealId, "hub_approve_all", { accepted, partial, rejected }, `${key}:event`);
    return json({ accepted, partial, rejected });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Approve-all failed", statusOf(e));
  }
}
