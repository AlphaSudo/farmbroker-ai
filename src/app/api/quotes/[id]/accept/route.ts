import { acceptRevision } from "@/lib/domain/revisions";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { buyerDeal } from "@/lib/serializers/buyer";
import { json, err, statusOf } from "@/lib/http";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json() as { requestId?: string };
    if (!body.requestId) return err("requestId required");
    await assertBuyer(req, await loadRequest(body.requestId));
    const result = await acceptRevision(id, body.requestId);
    return json({ deal: buyerDeal(result.deal), revision: result.revision });
  } catch (e) { return err(e instanceof Error ? e.message : "Accept failed", statusOf(e)); }
}
