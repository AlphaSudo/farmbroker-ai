import { supabase } from "../supabase";
import { eligibleSuppliers, type EligibilityResult } from "./eligibility";
import type { Supplier } from "../types";
import { num } from "../types";

export interface SupplyRequest { crop: string; pool: string; delivery_days: number; created_at: string; fixture_id?: string | null; }
export interface Snapshot extends EligibilityResult { totalKg: number; capped: boolean; source: "rpc" | "js"; }

const CAP = 256;

async function jsPath(request: SupplyRequest, includeBackup: boolean): Promise<Snapshot> {
  const sb = supabase();
  let query = sb.from("suppliers").select("*").eq("pool", request.pool);
  query = request.fixture_id ? query.eq("fixture_id", request.fixture_id) : query.is("fixture_id", null);
  const { data, error } = await query;
  if (error) throw error;
  const suppliers = (data ?? []) as Supplier[];
  const ids = suppliers.map((s) => s.id);
  const reserved = new Map<string, number>();
  if (ids.length) {
    const result = await sb.from("supply_reservations").select("supplier_id,kg").in("supplier_id", ids).eq("released", false);
    if (result.error) throw result.error;
    for (const row of result.data ?? []) reserved.set(row.supplier_id, (reserved.get(row.supplier_id) ?? 0) + Number(row.kg));
  }
  const free = suppliers.map((s) => ({ ...s, quantity_kg: Math.max(0, num(s.quantity_kg) - (reserved.get(s.id) ?? 0)) }));
  const r = eligibleSuppliers(free, {
    crop: request.crop, pool: request.pool, delivery_days: request.delivery_days, requested_at: request.created_at,
    fixture_id: request.fixture_id, include_backup: includeBackup,
  });
  return { ...r, totalKg: r.eligible.reduce((s, x) => s + num(x.quantity_kg), 0), capped: false, source: "js" };
}

// Bounded SQL snapshot first (2.1); JS fallback when the RPC is unavailable.
// Totals are SQL scalars over ALL eligible lots; the cap bounds transfer only.
export async function snapshotFor(request: SupplyRequest, includeBackup = false, cap = CAP): Promise<Snapshot> {
  const deadline = new Date(new Date(request.created_at).getTime() + request.delivery_days * 86400000).toISOString().slice(0, 10);
  try {
    const { data, error } = await supabase().rpc("get_supply_snapshot", {
      p_crop: request.crop, p_pool: request.pool, p_fixture: request.fixture_id ?? null,
      p_deadline: deadline, p_include_backup: includeBackup, p_cap: cap,
    });
    if (error) throw error;
    const s = data as { feasible_total_kg: number; lot_count: number; truncated: boolean; candidates: Array<{ supplier_id: string; kg: number; rate: number; quality: number | null; location: string | null }>; policy: string };
    const eligible: Supplier[] = (s.candidates ?? []).map((c) => ({
      id: c.supplier_id, name: "", crop: request.crop, quantity_kg: c.kg, min_price: Number(c.rate),
      available_date: null, location: c.location, quality_score: c.quality, pool: request.pool as Supplier["pool"],
      fixture_id: request.fixture_id ?? null,
    }));
    return {
      eligible, excluded: [], deadline: new Date(deadline).toISOString(), assumedOnTime: 0,
      totalKg: Number(s.feasible_total_kg ?? 0), capped: !!s.truncated, source: "rpc",
    };
  } catch (e) {
    if (e instanceof Error && /function|not found|does not exist|PGRST202/i.test(e.message)) return jsPath(request, includeBackup);
    throw e;
  }
}

export async function availableSupply(request: SupplyRequest, includeBackup = false): Promise<Snapshot> {
  return snapshotFor(request, includeBackup);
}
