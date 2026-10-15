// Release manifest writer (2.9): commit/tag, migrations, model/env names (never values).
// Usage: node scripts/release-manifest.mjs  →  docs/evidence/release-manifest.json
import { writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = (c) => { try { return execSync(c, { cwd: root, encoding: "utf8" }).trim(); } catch { return "unknown"; } };
const manifest = {
  commit: sh("git rev-parse HEAD"),
  tag: "v2.9",
  builtAt: new Date().toISOString(),
  migrations: readdirSync(join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).sort(),
  regions: { app: "https://farmbroker-aii.vercel.app", db: "supabase (Ireland region to verify at release)" },
  models: { primary: process.env.AI_MODEL_PRIMARY ?? "env:AI_MODEL_PRIMARY", fallback: process.env.AI_MODEL_SECONDARY ?? "env:AI_MODEL_SECONDARY", prompt: "p1", policy: "v1/v2" },
  fixtures: ["happy-path", "quality-recovery", "refund-required"],
  notes: "No secrets in this file. Provider/model availability rechecked at release.",
};
const dir = join(root, "docs", "evidence");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "release-manifest.json"), JSON.stringify(manifest, null, 2));
console.log("wrote docs/evidence/release-manifest.json");
