// Append-only deal events + idempotency keys (1.1/1.4/1.5).
import { supabase } from "../supabase";

export async function recordEvent(dealId: string, type: string, payload: object, opKey?: string): Promise<{ replayed: boolean }> {
  if (!opKey) {
    await supabase().from("deal_events").insert({ deal_id: dealId, type, payload });
    return { replayed: false };
  }
  const { data } = await supabase().from("deal_events").select("id").eq("op_key", opKey).maybeSingle();
  if (data) return { replayed: true };
  const { error } = await supabase().from("deal_events").insert({ deal_id: dealId, type, payload, op_key: opKey });
  if (error && /duplicate|unique/i.test(error.message)) return { replayed: true };
  if (error) throw error;
  return { replayed: false };
}

export async function timeline(dealId: string) {
  const { data, error } = await supabase().from("deal_events").select("type,payload,created_at").eq("deal_id", dealId).order("created_at");
  if (error) throw error;
  return data ?? [];
}
