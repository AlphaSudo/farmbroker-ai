// Zod contracts for model I/O (1.2). Models choose IDs from server sets; never invent facts.
import { z } from "zod";

export const IntentSchema = z.object({
  crop: z.string().min(1),
  quantity_kg: z.number().int().min(0),
  delivery_days: z.number().int().min(1).max(30),
  max_price_per_kg: z.number().positive().nullable(),
  clarifications: z.array(z.string()),
}).refine((v) => v.quantity_kg > 0 || v.clarifications.length > 0, "Ambiguous quantity requires clarifications");

export const CandidateSchema = z.object({
  id: z.string(),
  strategy: z.enum(["cost-first", "reliability-first"]),
  items: z.array(z.object({ supplier_ref: z.string(), kg: z.number(), rate: z.number() })),
  total_kg: z.number(), cost_total: z.number(), feasible: z.boolean(),
});

export const SelectionSchema = z.object({
  candidate_id: z.string().min(1),
  justification: z.string().min(10).max(600),
});

export const RecoverySelectionSchema = z.object({
  candidate_id: z.string().min(1),
  justification: z.string().min(10).max(600),
});
