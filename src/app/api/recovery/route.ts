import { supabase } from "@/lib/supabase";
import { openIncident, replacementCandidates, aiSelectReplacement, commitRecovery } from "@/lib/recovery/service";
import { loadRequest, assertBuyer, opKeyOf } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";

// GET ?incidentId= → incident + candidates (owner-scoped).
export async function GET(req: Request) {
  try {
    const incidentId = new URL(req.url).searchParams.get("incidentId");
    if (!incidentId) return err("incidentId required");
    const sb = supabase();
    const { data: inc, error } = await sb.from("shortage_incidents").select("*, deals!inner(request_id)").eq("id", incidentId).single();
    if (error || !inc) return err("Incident not found", 404);
    const i = inc as { deal_id: string; deals: { request_id: string } };
    await assertBuyer(req, await loadRequest(i.deals.request_id));
    return json({ incident: inc, candidates: await replacementCandidates(i.deal_id) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}

// POST { dealId, opKey? } → open (or reuse) incident + AI-select + commit ONE replacement.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { dealId?: string; opKey?: string };
    if (!body.dealId) return err("dealId required");
    const opKey = opKeyOf(req, body);
    const sb = supabase();
    const { data: deal } = await sb.from("deals").select("request_id").eq("id", body.dealId).single();
    if (!deal) return err("Deal not found", 404);
    await assertBuyer(req, await loadRequest((deal as { request_id: string }).request_id));
    const { incident, missing } = await openIncident(body.dealId, opKey);
    if (!incident) return json({ recovered: true, missing: 0, note: "Coverage already complete — no incident." });
    const id = (incident as { id: string }).id;
    const candidates = await replacementCandidates(body.dealId);
    if (candidates.length === 0) {
      await sb.from("shortage_incidents").update({ status: "refund_eligible" }).eq("id", id);
      return json({ incident: id, missing, candidates: [], refundEligible: true });
    }
    const sel = await aiSelectReplacement(candidates);
    const res = await commitRecovery(id, sel.candidate_id, sel.model, `${opKey}:commit`);
    return json({ incident: id, missing, selection: sel, committed: res, provenance: sel.model ? `Live AI (${sel.model})` : "Manual/rules-assisted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Recovery failed", statusOf(e));
  }
}
