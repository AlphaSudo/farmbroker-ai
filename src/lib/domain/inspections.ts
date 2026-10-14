import { supabase } from "../supabase";
import { qualityAgent, type InspectionInput } from "../agents/quality";

export async function inspectLot(allocationId: string, input: Omit<InspectionInput, "allocated_kg">, opKey: string) {
  const sb = supabase();
  const allocation = await sb.from("allocations").select("allocated_kg").eq("id", allocationId).single();
  if (allocation.error || !allocation.data) throw Object.assign(new Error("Allocation not found"), { status: 404 });
  const decision = qualityAgent({ ...input, allocated_kg: Number(allocation.data.allocated_kg) });
  const result = await sb.rpc("record_lot_inspection", { p_allocation: allocationId, p_input: input, p_decision: decision, p_op_key: opKey });
  if (result.error) throw Object.assign(new Error(result.error.message), { status: 409 });
  return result.data;
}
