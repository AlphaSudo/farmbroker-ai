import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { hubAllocation } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";
import type { Allocation } from "@/lib/types";

// GET ?dealId= → Hub allocation detail (names, costs, attempts). Hub key required.
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const dealId = new URL(req.url).searchParams.get("dealId");
    if (!dealId) return err("dealId required");
    const { data, error } = await supabase().from("allocations").select("*, supplier:suppliers(*)").eq("deal_id", dealId);
    if (error) throw error;
    return json({ allocations: ((data ?? []) as unknown as Allocation[]).map(hubAllocation) });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
