import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { buildSummary } from "@/lib/queries/summary";
import { json, err, statusOf } from "@/lib/http";

// GET → one server-composed buyer summary (kills request→deal→progress→events waterfall).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await assertBuyer(req, await loadRequest(id));
    return json(await buildSummary(id));
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
