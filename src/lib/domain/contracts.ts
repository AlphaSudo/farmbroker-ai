import { availableSupply, type SupplyRequest } from "./supply";
import { eligibleKg } from "./eligibility";
import { pricePreview } from "../agents/pricing";

export async function quoteEconomics(request: SupplyRequest & { quantity_kg: number; max_price: number }, price: number) {
  const supply = await availableSupply(request);
  if (eligibleKg(supply) < Number(request.quantity_kg)) throw Object.assign(new Error("Insufficient eligible on-time supply."), { status: 422 });
  const { clearing } = pricePreview(request, supply.eligible);
  if (!Number.isFinite(price) || price <= 0 || price < clearing || price > Number(request.max_price)) {
    throw Object.assign(new Error("Price must cover the supplier clearing floor and fit the buyer budget."), { status: 422 });
  }
  return { clearing, supply };
}
