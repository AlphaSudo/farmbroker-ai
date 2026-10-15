// Minimal repair builder (2.6): fix only the gap from current free stock.
// Accepted lots are immutable constraints; rejected/quarantined lots excluded;
// designated standby lots sort first; spend computed at entitlement rates.
import type { Supplier } from "../types";
import { num } from "../types";
import { candidatePlans, type Plan } from "../procurement/plans";

export interface RepairInput {
  missingKg: number;
  freeLots: Supplier[];
  standbyNames: string[];
  maxSpend: number; // minor EGP authority remaining
  clearingRate: number;
}

export function buildRepair(input: RepairInput): { plan: Plan | null; spendMinor: number } {
  const standby = new Set(input.standbyNames.map((s) => s.toLowerCase()));
  const ordered = [...input.freeLots].sort((a, b) => {
    const sa = standby.has(a.name.toLowerCase()) ? 0 : 1;
    const sb = standby.has(b.name.toLowerCase()) ? 0 : 1;
    return sa - sb || num(a.min_price) - num(b.min_price);
  });
  const [plan] = candidatePlans(ordered, input.missingKg);
  if (!plan) return { plan: null, spendMinor: 0 };
  const spendMinor = Math.round(plan.items.reduce((s, i) => s + i.kg * i.rate, 0) * 100);
  if (!Number.isSafeInteger(input.maxSpend) || input.maxSpend < 0 || spendMinor > input.maxSpend) return { plan: null, spendMinor };
  return { plan, spendMinor };
}
