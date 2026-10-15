import { supabase } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs/service";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

const authed = (req: Request): boolean =>
  hubAuthorized(req) || (!!process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET);

// POST /api/internal/wake — scheduler/operator sweep: enqueue reconcile checks for
// stuck payment attempts and resume-received webhooks. Bounded, idempotent.
export async function POST(req: Request) {
  try {
    if (!authed(req)) return err("Wake access required", 403);
    const sb = supabase();
    const { data: stuck } = await sb.from("payment_attempts").select("id,deal_id").in("status", ["created", "approved"]).lt("created_at", new Date(Date.now() - 10 * 60000).toISOString()).limit(20);
    const enqueued: string[] = [];
    for (const a of (stuck ?? []) as Array<{ id: string; deal_id: string }>) {
      const { id } = await enqueueJob("reconcile_check", a.deal_id, { attemptId: a.id }, `wake:reconcile:${a.id}`);
      enqueued.push(id);
    }
    const { data: pending } = await sb.from("paypal_events").select("event_id").eq("processed", "received").limit(20);
    return json({ reconcileEnqueued: enqueued.length, unprocessedEvents: (pending ?? []).length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Wake failed", statusOf(e));
  }
}
