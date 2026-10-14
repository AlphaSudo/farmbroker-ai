import { supabase } from "@/lib/supabase";
import { recordEvent } from "@/lib/domain/events";
import { acceptedCoverage } from "@/lib/recovery/service";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// POST { dealId, opKey? } (Hub) → record SIMULATED handover; only then is the order fulfilled.
// Handover requires: settled deal + full accepted coverage + no open incident.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const body = (await req.json()) as { dealId?: string; opKey?: string };
    if (!body.dealId) return err("dealId required");
    const opKey = body.opKey ?? globalThis.crypto.randomUUID();
    const sb = supabase();
    const { data: deal, error } = await sb.from("deals").select("*").eq("id", body.dealId).single();
    if (error || !deal) return err("Deal not found", 404);
    const d = deal as { status: string; outcome: string };
    if (d.status !== "settled") return err(`Handover needs a settled deal (now ${d.status}).`, 409);
    const { accepted, target } = await acceptedCoverage(body.dealId);
    if (accepted < target) return err(`Handover blocked: ${accepted}/${target}kg accepted.`, 409);
    const { data: open } = await sb.from("shortage_incidents").select("id").eq("deal_id", body.dealId).in("status", ["open", "recovering"]).limit(1);
    if (open && open.length > 0) return err("Handover blocked: unresolved shortage incident.", 409);
    const { error: uErr } = await sb.from("deals").update({ handover_at: new Date().toISOString(), outcome: "fulfilled", completed_at: new Date().toISOString() }).eq("id", body.dealId).eq("outcome", "pending");
    if (uErr) throw uErr;
    const { data: dd } = await sb.from("deals").select("request_id").eq("id", body.dealId).single();
    if (dd) await sb.from("buyer_requests").update({ status: "completed" }).eq("id", (dd as { request_id: string }).request_id);
    await recordEvent(body.dealId, "handover_simulated", { accepted_kg: accepted, note: "Simulated Hub→buyer handover receipt; no carrier integration." }, opKey);
    return json({ ok: true, outcome: "fulfilled" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Handover failed", statusOf(e));
  }
}
