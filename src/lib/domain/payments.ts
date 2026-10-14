import { supabase } from "../supabase";
import type { VerifiedCapture } from "../paypal";

export async function saveVerifiedCapture(attemptId: string, orderId: string, proof: VerifiedCapture) {
  if (!proof.ok) throw Object.assign(new Error(`Capture not verified: ${proof.reason}`), { status: 422 });
  const { data, error } = await supabase().rpc("record_verified_capture", { p_attempt: attemptId,
    p_proof: { orderId, captureId: proof.captureId, status: proof.status, amount: proof.amount, currency: proof.currency, payee: proof.payeeEmail, verifiedAt: new Date().toISOString() } });
  if (error) throw error;
  return data;
}
