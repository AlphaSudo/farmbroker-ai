import { chatJSON } from "@/lib/ai";
import { IntentSchema } from "@/lib/ai/schemas";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";

// POST { requestId?, brief } → extract normalized intent; ambiguous input returns clarifications, never an order.
export async function POST(req: Request) {
  try {
    const { requestId, brief } = (await req.json()) as { requestId?: string; brief?: string };
    if (!brief?.trim()) return err("brief required");
    if (requestId) await assertBuyer(req, await loadRequest(requestId));
    const ai = await chatJSON(
      'Extract a bulk crop sourcing intent. Units: convert metric tons to kg (10 tons = 10000 kg). Relative deadlines in days from today. Reply JSON {"crop": string, "quantity_kg": number, "delivery_days": number, "max_price_per_kg": number|null, "clarifications": string[]}. If units/crop are ambiguous (e.g. "bags"), set quantity_kg 0 and list clarifications.',
      `Buyer brief: "${brief}"`
    );
    if (!ai) return json({ intent: null, clarifications: ["AI unavailable — use the structured form."], source: "deterministic" });
    try {
      const v = IntentSchema.safeParse(JSON.parse(ai.text.match(/\{[\s\S]*\}/)?.[0] ?? "null"));
      if (!v.success) throw new Error("bad schema");
      return json({ intent: v.data, clarifications: v.data.clarifications, source: `ai:${ai.model}` });
    } catch {
      return json({ intent: null, clarifications: ["Could not normalize that brief — use the structured form."], source: "deterministic" });
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
