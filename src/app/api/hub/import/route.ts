import { supabase } from "@/lib/supabase";
import { generateDataset } from "@/lib/dataset";
import { json, err } from "@/lib/http";

// POST → load deterministic 100-row dataset as pool='full' (works on Vercel, no file needed).
export async function POST() {
  try {
    const rows = generateDataset().map((r) => ({ name: r.name, crop: r.crop, quantity_kg: r.qty, min_price: r.price, location: r.loc, quality_score: r.score, pool: "full" }));
    const { error } = await supabase().from("suppliers").upsert(rows, { onConflict: "name,crop,pool" });
    if (error) throw error;
    return json({ imported: rows.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Import failed", 500);
  }
}
