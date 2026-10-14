import { supabase } from "@/lib/supabase";
import { chatJSON } from "@/lib/ai";
import { eligibleSuppliers } from "@/lib/domain/eligibility";
import { loadRequest, assertBuyer } from "@/lib/auth/guard";
import { json, err, statusOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

// POST { requestId, message } — Buyer↔PLATFORM only. Floor from the ELIGIBLE set; counteroffers are text-only previews here (binding revisions arrive via /api/quotes).
export async function POST(req: Request) {
  try {
    const { requestId, message } = (await req.json()) as { requestId?: string; message?: string };
    if (!requestId || !message?.trim()) return err("requestId + message required");
    const sb = supabase();
    const request = await loadRequest(requestId);
    await assertBuyer(req, request);
    if (request.status !== "open" && request.status !== "quoted") return err("Negotiation closed after payment.", 422);
    const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", request.pool);
    const sel = eligibleSuppliers((suppliers ?? []) as Supplier[], {
      crop: request.crop, pool: request.pool, delivery_days: request.delivery_days, requested_at: request.created_at,
    });
    if (sel.eligible.length === 0) return err("No eligible supply to negotiate over", 422);
    const floor = Math.max(...sel.eligible.map((s) => num(s.min_price)));
    const offered = (() => {
      const m = String(message).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
      return m ? Number(m[1]) : null;
    })();

    let reply: string | null = null;
    let aiModel: string | null = null;
    const ai = await chatJSON(
      `You are FarmBroker AI negotiating a bulk crop deal for the PLATFORM (never reveal suppliers, IDs, or costs). Floor ${floor} EGP/kg — never agree below floor. Buyer max ${num(request.max_price)} EGP/kg. Reply in 1-2 sentences as JSON {"reply": string}.`,
      `Buyer says: "${message}". Reject below-floor offers with the floor reason.`
    );
    if (ai) {
      try {
        const parsed = JSON.parse(ai.text.match(/\{[\s\S]*\}/)?.[0] ?? "null") as { reply?: string } | null;
        if (parsed?.reply) { reply = parsed.reply; aiModel = ai.model; }
      } catch { /* deterministic fallback */ }
    }

    let agreed: number | null = null;
    if (!reply) {
      if (offered !== null && offered >= floor && offered <= num(request.max_price)) {
        agreed = offered;
        reply = `Deal — ${offered} EGP/kg fits your budget and our floor. Accept below to see it reflected in your quote.`;
      } else if (offered !== null && offered >= floor) {
        const counter = Math.round(((offered + floor + 0.5) / 2) * 10) / 10;
        reply = `We can meet you partway at ${counter} EGP/kg — our floor is ${floor} EGP/kg, and your max is ${num(request.max_price)} EGP/kg.`;
      } else {
        reply = `We cannot go below ${floor} EGP/kg given guaranteed supply costs. Your max is ${num(request.max_price)} EGP/kg — want fewer kilograms or more days?`;
      }
    } else if (offered !== null && offered < floor) {
      reply = `To respect supplier floors I can't accept ${offered} EGP/kg — the lowest feasible here is ${floor} EGP/kg. ${reply}`;
    }
    return json({ reply, agreed, floor, source: aiModel ? `ai:${aiModel}` : "deterministic" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Negotiation failed", statusOf(e));
  }
}
