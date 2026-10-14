import { supabase } from "@/lib/supabase";
import { json, err } from "@/lib/http";

// Hub-internal (GR#1: never linked from buyer flow).
export async function GET(req: Request) {
  try {
    const pool = new URL(req.url).searchParams.get("pool") ?? "demo";
    const { data, error } = await supabase().from("suppliers").select("*").eq("pool", pool).order("quantity_kg", { ascending: false });
    if (error) throw error;
    return json({ suppliers: data });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; crop?: string; quantity_kg?: number; min_price?: number; location?: string; quality_score?: number };
    if (!body.name || !body.crop || !body.quantity_kg || !body.min_price) return err("name, crop, quantity_kg, min_price required");
    const { data, error } = await supabase().from("suppliers").insert({ ...body, pool: "demo" }).select("*").single();
    if (error) throw error;
    return json({ supplier: data }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", 500);
  }
}
