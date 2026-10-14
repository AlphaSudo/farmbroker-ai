// Hub demo reset (1.7/1.8): clears transactional rows so a rehearsal starts clean.
// Suppliers (demo + full pools) are preserved. Hub key required. Audit-logged via response.
import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

const TABLES = ["ledger_entries", "refunds", "paypal_events", "provider_operations", "payment_attempts", "agent_steps", "agent_runs", "recovery_attempts", "shortage_incidents", "inspections", "supply_reservations", "allocations", "deal_events", "counteroffers", "deals", "quote_revisions", "buyer_requests"];

export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const sb = supabase();
    for (const t of TABLES) {
      const { error } = await sb.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    const { data: buyer } = await sb.from("buyer_requests").insert({
      buyer_name: "Cairo Foods", crop: "Mint", quantity_kg: 10000, delivery_days: 7, max_price: 9,
      status: "open", pool: "demo", scenario: "happy-path",
    }).select("id").single();
    return json({ ok: true, seed_request: (buyer as { id: string } | null)?.id ?? null });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Reset failed", statusOf(e));
  }
}
