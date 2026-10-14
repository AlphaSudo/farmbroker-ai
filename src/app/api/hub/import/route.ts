import { supabase } from "@/lib/supabase";
import { generateDataset } from "@/lib/dataset";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// POST → load deterministic 100-row dataset as pool='full'. Hub only.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const rows = generateDataset().map((r) => ({ name: r.name, crop: r.crop, quantity_kg: r.qty, min_price: r.price, location: r.loc, quality_score: r.score, pool: "full" }));
    const { error } = await supabase().from("suppliers").upsert(rows, { onConflict: "name,crop,pool" });
    if (error) throw error;
    return json({ imported: rows.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Import failed", statusOf(e));
  }
}
