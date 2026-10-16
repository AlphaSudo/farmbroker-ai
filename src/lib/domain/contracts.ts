import { availableSupply, type SupplyRequest } from "./supply";
import { eligibleKg } from "./eligibility";
import { pricePreview } from "../agents/pricing";
import { supabase } from "../supabase";
import { validatePlan, type Plan } from "../procurement/plans";

export async function quoteEconomics(request: SupplyRequest & { id?: string; quantity_kg: number; max_price: number }, price?: number) {
  const supply = await availableSupply(request);
  if (eligibleKg(supply) < Number(request.quantity_kg)) throw Object.assign(new Error("Insufficient eligible on-time supply."), { status: 422 });
  let binding: { decision_id: string; plan_hash: string } | null = null;
  if (request.id) {
    const sb = supabase();
    const selected = await sb.from("decision_records").select("id,plan_id,plan_hash,expires_at").eq("request_id", request.id)
      .eq("status", "valid").not("model", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (selected.error) throw selected.error;
    if (!selected.data) {
      const started = await sb.from("agent_runs").select("id").eq("request_id", request.id).eq("kind", "plan_selection").limit(1).maybeSingle();
      if (started.error) throw started.error;
      if (started.data) throw Object.assign(new Error("AI plan is not ready; resume selection before quoting."), { status: 503 });
    }
    if (selected.data) {
      if (new Date(selected.data.expires_at).getTime() <= Date.now()) throw Object.assign(new Error("Selected decision expired; obtain a fresh AI plan before quoting."), { status: 409 });
      const stored = await sb.from("procurement_plans").select("items,cost_total,strategy").eq("id", selected.data.plan_id).single();
      if (stored.error) throw stored.error;
      const plan = { id: stored.data.strategy, items: stored.data.items, cost_total: Number(stored.data.cost_total), total_kg: Number(request.quantity_kg) } as Plan;
      if (validatePlan(plan, supply.eligible, Number(request.quantity_kg), Number(request.max_price) * Number(request.quantity_kg)).length) {
        throw Object.assign(new Error("Selected stock changed; obtain a fresh AI plan before quoting."), { status: 409 });
      }
      supply.eligible = plan.items.map(item => ({ ...supply.eligible.find(s => s.id === item.supplier_id)!, quantity_kg: item.kg, min_price: item.rate }));
      binding = { decision_id: selected.data.id, plan_hash: selected.data.plan_hash };
    }
  }
  const { clearing } = pricePreview(request, supply.eligible);
  if (price !== undefined && (!Number.isFinite(price) || price <= 0 || price < clearing || price > Number(request.max_price))) {
    throw Object.assign(new Error("Price must cover the supplier clearing floor and fit the buyer budget."), { status: 422 });
  }
  return { clearing, supply, binding };
}
