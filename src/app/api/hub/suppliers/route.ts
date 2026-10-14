import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// Hub-internal (GR#1: never linked from buyer flow; server-enforced key).
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const pool = new URL(req.url).searchParams.get("pool") ?? "demo";
    const { data, error } = await supabase().from("suppliers").select("*").eq("pool", pool).order("quantity_kg", { ascending: false });
    if (error) throw error;
    return json({ suppliers: data });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}

export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const body = (await req.json()) as { name?: string; crop?: string; quantity_kg?: number; min_price?: number; location?: string; quality_score?: number };
    if (!body.name || !body.crop || !body.quantity_kg || !body.min_price) return err("name, crop, quantity_kg, min_price required");
    const { data, error } = await supabase().from("suppliers").insert({ ...body, pool: "demo" }).select("*").single();
    if (error) throw error;
    return json({ supplier: data }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
