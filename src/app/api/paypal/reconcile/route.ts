import { reconcileDeal } from "@/lib/paypal-reconciliation";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const { dealId } = await req.json() as { dealId?: string };
    if (!dealId) return err("dealId required");
    return json(await reconcileDeal(dealId, true));
  } catch (e) { return err(e instanceof Error ? e.message : "Reconcile failed", statusOf(e)); }
}
