import { supabase } from "../supabase";
import type { VerifiedCapture } from "../paypal";

export async function saveVerifiedCapture(attemptId: string, orderId: string, proof: VerifiedCapture) {
  return claimProviderOp("capture", `${attemptId}:${orderId}`).then(async (claim) => {
    if (claim.replayed) return { replayed: true };
    return recordCapture(attemptId, orderId, proof);
  });
}

async function recordCapture(attemptId: string, orderId: string, proof: VerifiedCapture) {  if (!proof.ok) throw Object.assign(new Error(`Capture not verified: ${proof.reason}`), { status: 422 });
  const { data, error } = await supabase().rpc("record_verified_capture", { p_attempt: attemptId,
    p_proof: { orderId, captureId: proof.captureId, status: proof.status, amount: proof.amount, currency: proof.currency, payee: proof.payeeEmail, verifiedAt: new Date().toISOString() } });
  if (error) throw error;
  return data;
}

// Provider operation registry (2.3): one row per operation key; replays return stored state.
export async function claimProviderOp(kind: string, opKey: string): Promise<{ replayed: boolean }> {
  const { data, error } = await supabase().from("provider_operations").select("id").eq("op_key", opKey).maybeSingle();
  if (error) throw error;
  if (data) return { replayed: true };
  const { error: iErr } = await supabase().from("provider_operations").insert({ kind, op_key: opKey, status: "claimed", payload: {} });
  if (iErr) {
    if (/duplicate|unique/i.test(iErr.message)) return { replayed: true };
    throw iErr;
  }
  return { replayed: false };
}
