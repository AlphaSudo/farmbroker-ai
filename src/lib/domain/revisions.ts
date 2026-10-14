// Immutable quote revisions (1.3). Totals in minor units + locked FX snapshot.
// Checkout charges the ACCEPTED revision's exact snapshot — never recomputed terms.
import { supabase } from "../supabase";
import { FX_SNAPSHOT, egpMajorToMinor, egpToUsdMinor } from "../money";

export const QUOTE_TTL_MIN = 30;
export const POLICY = "v1";

export async function createRevision(requestId: string, input: { per_kg: number; quantity_kg: number; delivery_days: number; snapshot: object }) {
  const sb = supabase();
  const { data: latest } = await sb.from("quote_revisions").select("version").eq("request_id", requestId).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((latest as { version?: number } | null)?.version ?? 0) + 1;
  const totalMinor = egpMajorToMinor(input.per_kg * input.quantity_kg);
  const deadline = new Date(Date.now() + input.delivery_days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb.from("quote_revisions").insert({
    request_id: requestId, version, per_kg: input.per_kg, total_minor: totalMinor, currency: "EGP",
    usd_minor: egpToUsdMinor(totalMinor), usd_currency: "USD", fx: FX_SNAPSHOT,
    delivery_deadline: deadline, spec: { crop: (input.snapshot as { crop?: string }).crop ?? null },
    expires_at: new Date(Date.now() + QUOTE_TTL_MIN * 60000).toISOString(),
    status: "draft", snapshot: input.snapshot, policy_version: POLICY,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function acceptRevision(revisionId: string, requestId: string) {
  const sb = supabase();
  const { data: rev, error } = await sb.from("quote_revisions").select("*").eq("id", revisionId).eq("request_id", requestId).single();
  if (error || !rev) throw Object.assign(new Error("Revision not found"), { status: 404 });
  const r = rev as { id: string; status: string; expires_at: string; per_kg: number; total_minor: number; usd_minor: number; fx: unknown; snapshot: unknown };
  if (r.status !== "draft") throw Object.assign(new Error(`Revision is ${r.status}`), { status: 409 });
  if (new Date(r.expires_at).getTime() < Date.now()) {
    await sb.from("quote_revisions").update({ status: "expired" }).eq("id", revisionId);
    throw Object.assign(new Error("Quote expired — request a fresh revision."), { status: 410 });
  }
  const { data: request } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
  if (!request) throw Object.assign(new Error("Request not found"), { status: 404 });
  const req = request as { max_price: number; status: string };
  if (Number(r.per_kg) > Number(req.max_price)) throw Object.assign(new Error("Revision exceeds your max price."), { status: 422 });
  if (!["open", "quoted"].includes(req.status)) throw Object.assign(new Error(`Request is ${req.status} — terms locked.`), { status: 409 });
  await sb.from("quote_revisions").update({ status: "superseded" }).eq("request_id", requestId).eq("status", "draft").neq("id", revisionId);
  await sb.from("quote_revisions").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", revisionId);
  return r;
}
