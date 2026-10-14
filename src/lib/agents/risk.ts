// Agent 2 — Risk: can we fulfill? → Confidence Score. Deterministic v1.
// confidence = min(98, round(coverage*90) + dateBonus[0|2]). Seed 10T/10T → 90+2 = 92%.
import type { Analysis, BuyerRequest, Supplier } from "../types";
import { num } from "../types";

export function riskAgent(request: Pick<BuyerRequest, "crop" | "quantity_kg" | "delivery_days">, suppliers: Supplier[]): Analysis {
  const want = request.crop.trim().toLowerCase();
  const matched = suppliers.filter((s) => s.crop.trim().toLowerCase() === want);
  const available_kg = matched.reduce((sum, s) => sum + num(s.quantity_kg), 0);
  const coverage = request.quantity_kg > 0 ? available_kg / request.quantity_kg : 0;

  let dateBonus = 0;
  if (matched.length > 0) {
    const deadline = Date.now() + request.delivery_days * 86400000;
    const allInTime = matched.every((s) => !s.available_date || new Date(s.available_date).getTime() <= deadline);
    dateBonus = allInTime ? 2 : 0;
  }
  const confidence = matched.length === 0 ? 0 : Math.min(98, Math.round(coverage * 90) + dateBonus);
  const risk_level = confidence >= 85 ? "Low" : confidence >= 60 ? "Medium" : "High";
  const quotable = confidence >= 60;

  const reasons =
    matched.length === 0
      ? [`No ${request.crop} supply found in the network.`]
      : [
          `Found ${available_kg.toLocaleString()}kg across ${matched.length} approved suppliers.`,
          dateBonus > 0 ? "All harvests fall within the delivery window." : "Some harvests fall outside the delivery window.",
          `Coverage ${(coverage * 100).toFixed(0)}% of requested ${request.quantity_kg.toLocaleString()}kg.`,
        ];
  return { confidence, available_kg, supplier_count: matched.length, risk_level, reasons, quotable };
}
