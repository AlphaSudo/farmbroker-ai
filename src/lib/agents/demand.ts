// Agent 1 — Demand: normalize raw buyer input into a structured request.
const CROPS: Record<string, string> = {
  mint: "Mint", "نعناع": "Mint", basil: "Basil", "ريحان": "Basil",
  lettuce: "Lettuce", "خس": "Lettuce",
};

export interface StructuredRequest { crop: string; quantity_kg: number; delivery_days: number; }

export function demandAgent(input: { crop: string; quantity_kg: number; delivery_days: number }): StructuredRequest {
  const raw = String(input.crop ?? "").trim().toLowerCase();
  const crop = CROPS[raw] ?? String(input.crop ?? "").trim();
  const quantity_kg = Math.round(Number(input.quantity_kg));
  const delivery_days = Math.round(Number(input.delivery_days));
  if (!crop) throw new Error("Crop is required");
  if (!Number.isFinite(quantity_kg) || quantity_kg <= 0) throw new Error("Quantity must be > 0 kg");
  if (!Number.isFinite(delivery_days) || delivery_days < 1 || delivery_days > 30) throw new Error("Delivery must be 1–30 days");
  return { crop, quantity_kg, delivery_days };
}
