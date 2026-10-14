// Agent 5 — Quality: Accept / Partial / Reject at the FarmBroker Collection Hub.
// Inputs: Quantity (weight), Quality (score 1-5), Condition, Moisture (mock ok).
import type { InspectionStatus } from "../types";

export interface InspectionInput { allocated_kg: number; weight_received_kg: number; moisture_pct: number; visual_score: number; condition: string; }
export interface QualityDecision { decision: Exclude<InspectionStatus, "pending">; grade: "A" | "B" | null; usable_kg: number; reasons: string[]; }

export function qualityAgent(i: InspectionInput): QualityDecision {
  const reasons: string[] = [];
  if (![i.allocated_kg, i.weight_received_kg, i.moisture_pct, i.visual_score].every(Number.isFinite) || i.allocated_kg <= 0 || i.weight_received_kg < 0) {
    return { decision: "failed", grade: null, usable_kg: 0, reasons: ["Invalid inspection measurements."] };
  }
  const usable = Math.max(0, Math.min(i.allocated_kg, Math.floor(i.weight_received_kg)));
  const weightPct = i.allocated_kg > 0 ? (i.weight_received_kg / i.allocated_kg) * 100 : 0;

  if (i.moisture_pct > 18) reasons.push(`Moisture ${i.moisture_pct}% exceeds 18% limit.`);
  if (i.visual_score <= 2) reasons.push(`Visual score ${i.visual_score}/5 too low.`);
  if (i.condition === "Damaged") reasons.push("Condition reported as Damaged.");
  if (weightPct < 50) reasons.push(`Received only ${weightPct.toFixed(0)}% of allocated quantity.`);
  if (reasons.length > 0) return { decision: "failed", grade: null, usable_kg: 0, reasons };

  if (weightPct < 95) {
    reasons.push(`Partial delivery: ${weightPct.toFixed(0)}% of allocated quantity usable.`);
    return { decision: "partial", grade: "B", usable_kg: usable, reasons };
  }
  const gradeA = i.moisture_pct <= 12 && i.visual_score >= 4 && i.condition === "Good";
  reasons.push(gradeA ? "Meets Grade A bar (moisture ≤12%, score ≥4, Good condition)." : "Meets Grade B bar.");
  return { decision: "passed", grade: gradeA ? "A" : "B", usable_kg: usable, reasons };
}

export const DEMO_INSPECTION = { moisture_pct: 10, visual_score: 5, condition: "Good" }; // Approve-All fills weight = allocated
