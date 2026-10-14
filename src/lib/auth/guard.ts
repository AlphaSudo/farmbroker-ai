// Ownership + idempotency guards (1.1). Buyer owns via fb_buyer cookie set at
// request creation; Hub ops via server-checked x-hub-key. Never trust view/UUID.
import { supabase } from "../supabase";
import { buyerToken, hubAuthorized } from "./actor";

export const statusOf = (e: unknown): number => (e as { status?: number })?.status ?? 500;

export async function loadRequest(id: string) {
  const { data, error } = await supabase().from("buyer_requests").select("*").eq("id", id).single();
  if (error || !data) throw Object.assign(new Error("Request not found"), { status: 404 });
  return data as { id: string; owner_token: string | null; pool: string; scenario: string; crop: string; quantity_kg: number; delivery_days: number; max_price: number; status: string; created_at: string; fixture_id?: string | null };
}

export async function assertBuyer(req: Request, rec: { owner_token: string | null }): Promise<"buyer" | "hub"> {
  if (hubAuthorized(req)) return "hub";
  const t = await buyerToken();
  if (!rec.owner_token || t !== rec.owner_token) throw Object.assign(new Error("Not your order (owner check). Open your own request link or use Hub access."), { status: 403 });
  return "buyer";
}

export function opKeyOf(req: Request, body?: { opKey?: string }): string {
  return body?.opKey ?? req.headers.get("Idempotency-Key") ?? globalThis.crypto.randomUUID();
}
