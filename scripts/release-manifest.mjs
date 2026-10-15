// Release manifest writer (2.9): commit/tag, migrations, model/env names (never values).
// Usage: node scripts/release-manifest.mjs  →  docs/evidence/release-manifest.json
import { writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = (c) => { try { return execSync(c, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "unknown"; } };
const dirty = !!sh("git status --porcelain");
const manifest = {
  commit: sh("git rev-parse HEAD"),
  tag: dirty || sh("git describe --tags --exact-match HEAD") === "unknown" ? null : sh("git describe --tags --exact-match HEAD"),
  baseTag: sh("git describe --tags --abbrev=0"),
  workingTreeDirty: dirty,
  builtAt: new Date().toISOString(),
  migrations: readdirSync(join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort(),
  regions: { app: "https://farmbroker-aii.vercel.app", db: "supabase (Ireland region to verify at release)" },
  models: { primary: process.env.AI_MODEL_PRIMARY ?? "env:AI_MODEL_PRIMARY", fallback: process.env.AI_MODEL_SECONDARY ?? "env:AI_MODEL_SECONDARY", prompt: "p1", policy: "v1/v2" },
  fixtures: ["happy-path", "quality-recovery", "refund-required"],
  notes: "No secrets in this file. Provider/model availability rechecked at release.",
};
const target = resolve(process.argv.find(a => a.startsWith("--output="))?.slice(9) ?? join(root,"docs/evidence/release-manifest.json"));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(manifest, null, 2));
console.log("wrote release manifest");
