import { supabase } from "@/lib/supabase";
import { assertBuyer } from "@/lib/auth/guard";
import { buyerDeal } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";

// Owner or Hub only. owner_token is never returned.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const sb = supabase();
    const { data: request, error } = await sb.from("buyer_requests").select("*").eq("id", id).single();
    if (error || !request) return err("Request not found", 404);
    await assertBuyer(req, request);
    const { owner_token: _o, ...safe } = request as Record<string, unknown>;
    void _o;
    const { data: deal } = await sb.from("deals").select("*").eq("request_id", id).maybeSingle();
    return json({ request: safe, deal: deal ? buyerDeal(deal as never) : null });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
