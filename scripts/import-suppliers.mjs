// Imports pal/data/suppliers.csv (100 rows) as pool='full'. Demo pool untouched.
// Usage: node scripts/import-suppliers.mjs (from farmbroker-ai/)
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function envFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}
const env = envFile(join(root, ".env.local"));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const csvPath = join(root, "..", "data", "suppliers.csv");
if (!existsSync(csvPath)) throw new Error(`missing ${csvPath}`);
const [, ...lines] = readFileSync(csvPath, "utf8").trim().split("\n");
const rows = lines.map((l) => {
  const [name, crop, qty, loc, score, price] = l.split(",");
  return { name, crop, quantity_kg: Number(qty), min_price: Number(price), location: loc, quality_score: Number(score), pool: "full" };
});
const { error } = await sb.from("suppliers").upsert(rows, { onConflict: "name,crop,pool" });
if (error) throw error;
console.log(`imported ${rows.length} full-pool suppliers`);
