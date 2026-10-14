import { supabase } from "@/lib/supabase";
import { json, err } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const sb = supabase();
    const { data: request, error } = await sb.from("buyer_requests").select("*").eq("id", id).single();
    if (error) throw new Error("Request not found");
    const { data: deal } = await sb.from("deals").select("*").eq("request_id", id).maybeSingle();
    return json({ request, deal: deal ?? null });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", 500);
  }
}
