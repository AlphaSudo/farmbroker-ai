import { hubAuthorized } from "@/lib/auth/actor";
import { runNextJob } from "@/lib/jobs/worker";
import { jobHealth } from "@/lib/jobs/service";
import { json, err, statusOf } from "@/lib/http";

export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req) && !(process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET)) return err("Worker access required", 403);
    return json(await runNextJob());
  } catch (e) { return err(e instanceof Error ? e.message : "Worker failed", statusOf(e)); }
}
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    return json(await jobHealth());
  } catch (e) { return err(e instanceof Error ? e.message : "Health failed", statusOf(e)); }
}
