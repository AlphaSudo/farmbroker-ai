import { supabase } from "../supabase";
import { FX_SNAPSHOT, egpMajorToMinor, egpToUsdMinor } from "../money";
import { loadRequest } from "../auth/guard";
import { quoteEconomics } from "./contracts";

export const QUOTE_TTL_MIN = 30;
export const POLICY = "v1";

export async function createRevision(requestId: string, input: { per_kg: number; quantity_kg: number; delivery_days: number; snapshot: object }) {
  const sb = supabase();
  const request = await loadRequest(requestId);
  const { clearing, binding } = await quoteEconomics(request, input.per_kg);
  if (!["open", "quoted"].includes(request.status)) throw Object.assign(new Error("Terms locked after payment."), { status: 409 });
  if (input.quantity_kg !== Number(request.quantity_kg) || input.delivery_days !== Number(request.delivery_days)) throw Object.assign(new Error("Request scope mismatch."), { status: 422 });
  const totalMinor = egpMajorToMinor(input.per_kg * input.quantity_kg);
  const deadline = new Date(new Date(request.created_at).getTime() + input.delivery_days * 86400000).toISOString().slice(0, 10);
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await sb.from("quote_revisions").select("version").eq("request_id", requestId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) throw latest.error;
    const result = await sb.from("quote_revisions").insert({
      request_id: requestId, version: Number(latest.data?.version ?? 0) + 1,
      per_kg: input.per_kg, total_minor: totalMinor, currency: "EGP",
      usd_minor: egpToUsdMinor(totalMinor), usd_currency: "USD", fx: FX_SNAPSHOT,
      delivery_deadline: deadline, spec: { crop: request.crop },
      expires_at: new Date(Date.now() + QUOTE_TTL_MIN * 60000).toISOString(), status: "draft",
      snapshot: { ...input.snapshot, crop: request.crop, clearing, ...(binding ?? { provenance: "manual" }) }, policy_version: POLICY,
    }).select("*").single();
    if (!result.error) return result.data;
    if (result.error.code !== "23505") throw result.error;
  }
  throw Object.assign(new Error("Quote changed concurrently; retry."), { status: 409 });
}

export async function acceptRevision(revisionId: string, requestId: string) {
  const sb = supabase();
  const result = await sb.from("quote_revisions").select("*").eq("id", revisionId).eq("request_id", requestId).single();
  if (result.error || !result.data) throw Object.assign(new Error("Revision not found"), { status: 404 });
  const revision = result.data;
  if (revision.status === "accepted") {
    const existing = await sb.from("deals").select("*").eq("request_id", requestId).eq("accepted_quote_id", revisionId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { revision, deal: existing.data };
  }
  const request = await loadRequest(requestId);
  const { clearing, binding } = await quoteEconomics(request, Number(revision.per_kg));
  if ((revision.snapshot?.decision_id ?? null) !== (binding?.decision_id ?? null)) throw Object.assign(new Error("Selected decision changed; request a fresh revision."), { status: 409 });
  if (Number(revision.snapshot?.clearing) !== clearing) throw Object.assign(new Error("Supply economics changed; request a fresh revision."), { status: 409 });
  const accepted = await sb.rpc("accept_quote_contract", { p_revision: revisionId, p_request: requestId });
  if (accepted.error) throw Object.assign(new Error(accepted.error.message), { status: /expired/.test(accepted.error.message) ? 410 : 409 });
  return { revision: { ...revision, status: "accepted" }, deal: accepted.data };
}
