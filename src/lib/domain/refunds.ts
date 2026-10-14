import { supabase } from "../supabase";

export function refundAmount(capturedMinor: number, alreadyRefundedMinor = 0): number {
  if (!Number.isSafeInteger(capturedMinor) || capturedMinor <= 0 || !Number.isSafeInteger(alreadyRefundedMinor) || alreadyRefundedMinor < 0 || alreadyRefundedMinor > capturedMinor) throw new Error("Invalid capture/refund amounts");
  return capturedMinor - alreadyRefundedMinor;
}

export async function saveProviderRefund(refundId: string, provider: { id: string; status: string }) {
  const result = await supabase().rpc("record_provider_refund", { p_refund: refundId, p_provider_id: provider.id, p_status: provider.status });
  if (result.error) throw result.error;
  return result.data;
}
