// Shared domain types (DB rows + agent payloads). Money = integer EGP unless noted.
export type Pool = "demo" | "full";

export interface Supplier {
  id: string; name: string; crop: string; quantity_kg: number;
  min_price: number; available_date: string | null; location: string | null;
  quality_score: number | null; pool: Pool;
  fixture_id?: string | null; backup_only?: boolean; quarantined?: boolean;
}

export interface Analysis {
  confidence: number; available_kg: number; supplier_count: number;
  risk_level: "Low" | "Medium" | "High"; reasons: string[]; quotable: boolean;
}

export interface BuyerRequest {
  id: string; buyer_name: string; crop: string; quantity_kg: number;
  delivery_days: number; max_price: number; status: string;
  analysis: Analysis | null;
}

export interface Deal {
  id: string; request_id: string; total_price: number; supplier_cost: number;
  margin: number; per_kg: number; clearing_per_kg: number;
  paypal_order_id: string | null; paypal_capture_id: string | null; status: string;
}

export type InspectionStatus = "pending" | "passed" | "partial" | "failed";

export interface Allocation {
  id: string; deal_id: string; supplier_id: string; allocated_kg: number;
  cost: number; quality_grade: string | null; inspection_status: InspectionStatus;
  payout_status: string; weight_received_kg: number | null; moisture_pct: number | null;
  visual_score: number | null; condition: string | null; usable_kg: number | null;
  supplier?: Supplier;
}

export interface Quote {
  quantity_kg: number; per_kg: number; total: number; supplier_cost: number;
  margin: number; clearing_per_kg: number; min_cost_floor: number;
  market_range: [number, number]; delivery_days: number; confidence: number;
  quotable: boolean; reason?: string;
}

export interface Payout { supplier_id: string; supplier_name: string; kg: number; amount: number; grade: string | null; status: string; }
export interface Settlement { total: number; payouts: Payout[]; margin: number; deal_id: string; }

export const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));
