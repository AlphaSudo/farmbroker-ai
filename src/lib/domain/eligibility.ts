// Shared eligible-supply selector (1.1). ONE definition used by analysis, quote,
// deals, procurement, and recovery. Unknown dates: demo-fixture policy counts
// null available_date as on-time and records that assumption in the snapshot.
import type { Supplier } from "../types";
import { num } from "../types";

export interface EligibilityInput { crop: string; pool: string; delivery_days: number; requested_at: string; fixture_id?: string | null; include_backup?: boolean; }
export interface EligibilityResult { eligible: Supplier[]; excluded: Array<{ name: string; reason: string }>; deadline: string; assumedOnTime: number; }

export function eligibleSuppliers(suppliers: Supplier[], input: EligibilityInput): EligibilityResult {
  const want = input.crop.trim().toLowerCase();
  const deadline = new Date(new Date(input.requested_at).getTime() + input.delivery_days * 86400000);
  const eligible: Supplier[] = [];
  const excluded: Array<{ name: string; reason: string }> = [];
  let assumedOnTime = 0;
  for (const s of suppliers) {
    if ((s.fixture_id ?? null) !== (input.fixture_id ?? null)) { excluded.push({ name: s.name, reason: "different fixture" }); continue; }
    if (s.quarantined || (s.backup_only && !input.include_backup)) { excluded.push({ name: s.name, reason: "unavailable lot" }); continue; }
    if (s.crop.trim().toLowerCase() !== want) { excluded.push({ name: s.name, reason: "wrong crop" }); continue; }
    if (s.pool !== (input.pool as Supplier["pool"])) { excluded.push({ name: s.name, reason: "different pool" }); continue; }
    if (num(s.quantity_kg) <= 0) { excluded.push({ name: s.name, reason: "zero quantity" }); continue; }
    if (s.available_date) {
      if (new Date(s.available_date).getTime() > deadline.getTime()) { excluded.push({ name: s.name, reason: "late availability" }); continue; }
    } else {
      assumedOnTime++; // documented fixture policy
    }
    eligible.push(s);
  }
  return { eligible, excluded, deadline: deadline.toISOString(), assumedOnTime };
}

export const eligibleKg = (r: EligibilityResult): number => r.eligible.reduce((s, x) => s + num(x.quantity_kg), 0);
