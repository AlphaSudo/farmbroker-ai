import { supabase } from "@/lib/supabase";
import { enqueueJob } from "@/lib/jobs/service";
import { runNextJob } from "@/lib/jobs/worker";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

export const maxDuration = 60;
// One bounded sweep AND one claimed job. Native cron drives it without a browser.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req) && !(process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET)) return err("Wake access required", 403);
    const sb = supabase();
    const stuck = await sb.from("payment_attempts").select("id,deal_id").in("status", ["created", "approved", "capture_pending"]).lt("created_at", new Date(Date.now() - 10 * 60000).toISOString()).limit(20);
    if (stuck.error) throw stuck.error;
    for (const a of stuck.data ?? []) await enqueueJob("reconcile_check", a.deal_id, { dealId: a.deal_id }, "wake:reconcile:" + a.id);
    const refunds = await sb.from("refunds").select("id,deal_id").in("status", ["requested", "pending", "needs_review"]).limit(20);
    if (refunds.error) throw refunds.error;
    for (const refund of refunds.data ?? []) await enqueueJob("reconcile_check", refund.deal_id, { dealId: refund.deal_id }, "wake:refund:" + refund.id);
    const pending = await sb.from("paypal_events").select("event_id").eq("processed", "received").limit(20);
    if (pending.error) throw pending.error;
    for (const event of pending.data ?? []) await enqueueJob("paypal_event", "provider", { eventId: event.event_id }, "paypal-event:" + event.event_id);
    return json({ reconcileEnqueued: stuck.data?.length ?? 0, unprocessedEvents: pending.data?.length ?? 0, worker: await runNextJob() });
  } catch (e) { return err(e instanceof Error ? e.message : "Wake failed", statusOf(e)); }
}
