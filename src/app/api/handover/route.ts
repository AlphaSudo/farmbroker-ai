import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// POST { dealId, opKey? } (Hub) → record SIMULATED handover; only then is the order fulfilled.
// Handover requires: settled deal + full accepted coverage + no open incident.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const body = (await req.json()) as { dealId?: string; opKey?: string };
    if (!body.dealId) return err("dealId required");
    const result = await supabase().rpc("complete_deal_phase", { p_deal: body.dealId, p_phase: "handover" });
    if (result.error) return err(result.error.message, 409);
    return json({ ok: true, outcome: "fulfilled" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Handover failed", statusOf(e));
  }
}
