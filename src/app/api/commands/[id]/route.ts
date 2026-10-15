import { supabase } from "@/lib/supabase";
import { json, err, statusOf } from "@/lib/http";

// GET ?commandId= | ?jobId= → durable command/job status for polling UIs.
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const commandId = u.searchParams.get("commandId");
    const jobId = u.searchParams.get("jobId");
    const sb = supabase();
    if (commandId) {
      const { data, error } = await sb.from("command_receipts").select("command_id,deal_id,plan_hash,result,created_at").eq("command_id", commandId).single();
      if (error || !data) return err("Receipt not found", 404);
      return json({ receipt: data });
    }
    if (jobId) {
      const { data, error } = await sb.from("commerce_jobs").select("id,status,kind,attempt,result,error,created_at").eq("id", jobId).single();
      if (error || !data) return err("Job not found", 404);
      return json({ job: data });
    }
    return err("commandId or jobId required");
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
