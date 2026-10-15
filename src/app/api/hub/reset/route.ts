// Hub reset is RETIRED on shared environments (2.0). It runs only when the server
// explicitly opts in (ALLOW_DESTRUCTIVE_RESET=true) AND the caller declares a
// disposable scope. Rehearsals create isolated fixtures instead of wiping history.
import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

const TABLES = ["ledger_entries", "refunds", "paypal_events", "provider_operations", "payment_attempts", "agent_steps", "agent_runs", "recovery_attempts", "shortage_incidents", "inspections", "supply_reservations", "allocations", "deal_events", "counteroffers", "deals", "quote_revisions", "buyer_requests"];

export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const body = (await req.json().catch(() => ({}))) as { scope?: string };
    if (process.env.ALLOW_DESTRUCTIVE_RESET !== "true" || body.scope !== "disposable") {
      return err("Reset retired: isolated fixtures only. Rehearsals must not delete shared financial history.", 403);
    }
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
