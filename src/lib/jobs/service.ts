// Durable job service (2.4). Enqueue + claim + fenced complete/fail with backoff.
// Workers never hold inventory locks during provider I/O; effects stay idempotent.
import { supabase } from "../supabase";

export type JobKind = "ai_plan" | "recovery_advance" | "reconcile_check" | "paypal_event" | "projection" | "procure_bound";

export async function enqueueJob(kind: JobKind, scope: string, payload: object, opKey: string, expectedVersion?: number): Promise<{ id: string; replayed: boolean }> {
  const sb = supabase();
  const { data: seen } = await sb.from("commerce_jobs").select("id").eq("op_key", opKey).maybeSingle();
  if (seen) return { id: (seen as { id: string }).id, replayed: true };
  const { data, error } = await sb.from("commerce_jobs").insert({
    kind, scope, payload, expected_version: expectedVersion ?? null, op_key: opKey,
    deadline: new Date(Date.now() + 24 * 3600000).toISOString(),
  }).select("id").single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const { data: r2 } = await sb.from("commerce_jobs").select("id").eq("op_key", opKey).single();
      return { id: (r2 as { id: string }).id, replayed: true };
    }
    throw error;
  }
  return { id: (data as { id: string }).id, replayed: false };
}

export async function completeJob(id: string, leaseToken: string, result: object): Promise<boolean> {
  const { data, error } = await supabase().rpc("finish_commerce_job", { p_id: id, p_token: leaseToken, p_result: result, p_error: null });
  if (error) throw error;
  return !!data; // false = fencing: lease lost, result discarded
}

export async function failJob(id: string, leaseToken: string, errorText: string): Promise<void> {
  const { error } = await supabase().rpc("finish_commerce_job", { p_id: id, p_token: leaseToken, p_result: null, p_error: errorText.slice(0, 1000) });
  if (error) throw error;
}

export async function jobHealth() {
  const sb = supabase();
  const { data } = await sb.from("commerce_jobs").select("status,kind,attempt,created_at,lease_expires_at,error").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as Array<{ status: string; kind: string }>;
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const { data: oldest } = await sb.from("commerce_jobs").select("created_at").in("status", ["queued", "leased"]).order("created_at").limit(1).maybeSingle();
  return { byStatus, oldestWaiting: (oldest as { created_at?: string } | null)?.created_at ?? null, sample: rows.slice(0, 50) };
}
