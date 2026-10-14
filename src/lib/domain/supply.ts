import { supabase } from "../supabase";
import { eligibleSuppliers, type EligibilityResult } from "./eligibility";
import type { Supplier } from "../types";

export interface SupplyRequest { crop: string; pool: string; delivery_days: number; created_at: string; fixture_id?: string | null; }

export async function availableSupply(request: SupplyRequest, includeBackup = false): Promise<EligibilityResult> {
  const sb = supabase();
  let query = sb.from("suppliers").select("*").eq("pool", request.pool);
  query = request.fixture_id ? query.eq("fixture_id", request.fixture_id) : query.is("fixture_id", null);
  const { data, error } = await query;
  if (error) throw error;
  const suppliers = (data ?? []) as Supplier[];
  const ids = suppliers.map(s => s.id);
  const reserved = new Map<string, number>();
  if (ids.length) {
    const result = await sb.from("supply_reservations").select("supplier_id,kg").in("supplier_id", ids).eq("released", false);
    if (result.error) throw result.error;
    for (const row of result.data ?? []) reserved.set(row.supplier_id, (reserved.get(row.supplier_id) ?? 0) + Number(row.kg));
  }
  return eligibleSuppliers(suppliers.map(s => ({ ...s, quantity_kg: Math.max(0, Number(s.quantity_kg) - (reserved.get(s.id) ?? 0)) })), {
    crop: request.crop, pool: request.pool, delivery_days: request.delivery_days, requested_at: request.created_at,
    fixture_id: request.fixture_id, include_backup: includeBackup,
  });
}
