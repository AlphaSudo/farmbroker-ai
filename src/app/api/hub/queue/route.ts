import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// GET → Hub ops queue: pending inspections, short orders, open incidents, pending refunds.
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const sb = supabase();
    const [insp, shorts, incs, refs, deals] = await Promise.all([
      sb.from("allocations").select("id", { count: "exact", head: true }).eq("inspection_status", "pending"),
      sb.from("deals").select("id,buyer_requests!inner(buyer_name,crop)", { count: "exact" }).eq("status", "short"),
      sb.from("shortage_incidents").select("id,deal_id,missing_kg,status").in("status", ["open", "recovering", "refund_eligible"]),
      sb.from("refunds").select("id,deal_id,status").in("status", ["requested", "pending", "needs_review"]),
      sb.from("deals").select("id,status,outcome,total_price,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    return json({
      pendingInspections: insp.count ?? 0,
      shortDeals: shorts.data ?? [],
      incidents: incs.data ?? [],
      refunds: refs.data ?? [],
      deals: (deals.data ?? []).map((d) => {
        const x = d as { id: string; status: string; outcome: string; total_price: number };
        return { ...x, total_price: Number(x.total_price) };
      }),
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
