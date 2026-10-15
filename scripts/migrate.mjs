// Bootstrap: applies supabase/migrations/*.sql in numeric order with checksum tracking.
// Usage: DATABASE_URL=... node scripts/migrate.mjs  (falls back to pal/credentials.txt + SUPABASE_URL)
// Fresh clones need only the repo + DATABASE_URL. Checksum mismatch stops with an error.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dir = join(root, "supabase", "migrations");

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

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const db = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await db.connect();
await db.query(`create table if not exists schema_migrations (version text primary key, checksum text not null, applied_at timestamptz not null default now())`);
const { rows: done } = await db.query("select version, checksum from schema_migrations");
const seen = new Map(done.map((r) => [r.version, r.checksum]));
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  const sum = createHash("sha256").update(sql).digest("hex");
  if (seen.has(f)) {
    if (seen.get(f) !== sum) throw new Error(`Checksum mismatch on applied migration ${f} — resolve manually, never edit applied history.`);
    console.log(`skip ${f} (applied, checksum ok)`);
    continue;
  }
  await db.query("begin");
  try {
    await db.query(sql);
    await db.query("insert into schema_migrations (version, checksum) values ($1, $2)", [f, sum]);
    await db.query("commit");
    console.log(`applied ${f}`);
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
await db.end();
console.log("migrate ok");
