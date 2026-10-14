// One-shot DB setup: runs supabase/migrations/001_schema.sql + demo seed.
// Usage: node scripts/migrate.mjs (from farmbroker-ai/)
// Password: reads pal/credentials.txt (gitignored, outside repo) or DATABASE_URL env.
// If direct connection fails, paste the SQL file in Supabase SQL editor instead.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function envFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

const env = envFile(join(root, ".env.local"));
let databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl) {
  const credPath = join(root, "..", "credentials.txt");
  const cred = existsSync(credPath) ? readFileSync(credPath, "utf8") : "";
  const pwd = cred.match(/supabase\s*\npassword\s+(\S+)/)?.[1] ?? "";
  const ref = (env.SUPABASE_URL ?? "").match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
  if (!pwd || !ref) throw new Error("Need DATABASE_URL env or credentials.txt + SUPABASE_URL");
  databaseUrl = `postgres://postgres:${encodeURIComponent(pwd)}@db.${ref}.supabase.co:5432/postgres`;
}

const sql = readFileSync(join(root, "supabase", "migrations", "001_schema.sql"), "utf8");
const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await db.connect();
await db.query(sql);

const { rows } = await db.query("select count(*)::int as n from suppliers where pool='demo'");
if (rows[0].n === 0) {
  await db.query(
    `insert into suppliers (name,crop,quantity_kg,min_price,available_date,location,quality_score,pool) values
     ('Ahmed','Mint',2000,7.0,CURRENT_DATE+3,'Menoufia',92,'demo'),
     ('Mohamed','Mint',3000,7.5,CURRENT_DATE+3,'Menoufia',88,'demo'),
     ('Ali','Mint',5000,7.3,CURRENT_DATE+3,'Giza',90,'demo')`
  );
  await db.query(
    `insert into buyer_requests (buyer_name,crop,quantity_kg,delivery_days,max_price,status) values
     ('Cairo Foods','Mint',10000,7,9,'open')`
  );
  console.log("seeded demo pool (3 suppliers + 1 buyer)");
} else {
  console.log("demo pool already seeded, skipped");
}
await db.end();
console.log("migrate ok");
