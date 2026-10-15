// Ordered, checksummed migrations. Explicit baseline for previously manual setup:
// node scripts/migrate.mjs --baseline-through=010 --pooler=HOST [--dry-run]
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flag = name => process.argv.find(a => a.startsWith("--" + name + "="))?.slice(name.length + 3);
const dryRun = process.argv.includes("--dry-run");
const baseline = flag("baseline-through");
if (baseline && !/^\d{3}$/.test(baseline)) throw new Error("baseline-through must be a three-digit version");
const env = {};
const envPath = join(root, ".env.local");
if (existsSync(envPath)) for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"|"$/g, "");
}
let config;
if (process.env.DATABASE_URL) config = { connectionString: process.env.DATABASE_URL };
else {
  const cred = join(root, "..", "credentials.txt");
  const password = existsSync(cred) ? readFileSync(cred, "utf8").match(/supabase\s*\npassword\s+(\S+)/i)?.[1] : null;
  const ref = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).hostname.split(".")[0] : "";
  if (!password || !ref) throw new Error("Set DATABASE_URL; optional local fallback needs credentials.txt and SUPABASE_URL");
  const host = flag("pooler");
  config = { host: host ?? "db." + ref + ".supabase.co", user: host ? "postgres." + ref : "postgres", password, database: "postgres", port: 5432 };
}
const files = readdirSync(join(root, "supabase/migrations")).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
const db = new pg.Client({ ...config, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await db.connect();
try {
  await db.query("set statement_timeout='60s'; set lock_timeout='3s'");
  await db.query("select pg_advisory_lock(hashtextextended('farmbroker-migrations',0))");
  if (dryRun) await db.query("begin");
  await db.query("create table if not exists schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now())");
  await db.query("alter table schema_migrations enable row level security; revoke all on schema_migrations from anon,authenticated");
  const { rows } = await db.query("select version,checksum from schema_migrations");
  const seen = new Map(rows.map(r => [r.version, r.checksum]));
  if (baseline && files.some(f => f.slice(0, 3) <= baseline && !seen.has(f))) {
    const required = ["accept_quote_contract(uuid,uuid)", "record_verified_capture(uuid,jsonb)", "reserve_paid_plan(uuid,uuid,integer,text,jsonb)", "record_lot_inspection(uuid,jsonb,jsonb,text)", "commit_recovery_plan(uuid,jsonb,text,text)"];
    for (const signature of required) {
      const found = await db.query("select to_regprocedure($1) as fn", [signature]);
      if (!found.rows[0].fn) throw new Error("Baseline cannot be adopted: missing " + signature);
    }
    if (baseline !== "010") throw new Error("Only the explicitly reviewed 001-010 manual baseline is supported");
  }
  for (const file of files) {
    const source = readFileSync(join(root, "supabase/migrations", file), "utf8").replace(/\r\n/g, "\n");
    const checksum = createHash("sha256").update(source).digest("hex");
    if (seen.has(file)) {
      if (seen.get(file) !== checksum) throw new Error("Checksum mismatch: " + file);
      console.log("skip " + file); continue;
    }
    const adopt = baseline && file.slice(0, 3) <= baseline;
    // The historical files have outer BEGIN/COMMIT. Remove only that envelope,
    // preserving PL/pgSQL blocks, so tracking and schema share this transaction.
    const sql = source.replace(/^((?:\s|--[^\n]*\n)*)begin\s*;/i, "$1").replace(/\bcommit;\s*$/i, "");
    if (/create\s+(?:unique\s+)?index\s+concurrently/i.test(sql)) throw new Error("Online-index migration needs a dedicated nontransactional protocol: " + file);
    if (!dryRun) await db.query("begin");
    try {
      if (!adopt) await db.query(sql);
      await db.query("insert into schema_migrations(version,checksum) values($1,$2)", [file, checksum]);
      if (!dryRun) await db.query("commit");
      console.log((adopt ? "baseline " : "apply ") + file + (dryRun ? " (rollback rehearsal)" : ""));
    } catch (error) {
      if (!dryRun) await db.query("rollback");
      throw error;
    }
  }
  if (dryRun) { await db.query("rollback"); console.log("Dry run rolled back; no migrations or baseline records retained."); }
  else await db.query("notify pgrst,'reload schema'");
} finally {
  if (dryRun) await db.query("rollback").catch(() => {});
  await db.end();
}
