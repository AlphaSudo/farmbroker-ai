import { supabase } from "@/lib/supabase";
import { chatJSON } from "@/lib/ai";
import { json, err, poolOf } from "@/lib/http";
import type { Supplier } from "@/lib/types";
import { num } from "@/lib/types";

// POST { requestId, message } — Buyer↔PLATFORM negotiation only (never suppliers).
// Floor: max supplier min (per-kg). LLM tried first, deterministic fallback always.
export async function POST(req: Request) {
  try {
    const { requestId, message } = (await req.json()) as { requestId?: string; message?: string };
    if (!requestId || !message?.trim()) return err("requestId + message required");
    const pool = poolOf(req.url);
    const sb = supabase();
    const { data: request, error } = await sb.from("buyer_requests").select("*").eq("id", requestId).single();
    if (error || !request) return err("Request not found", 404);
    const { data: suppliers } = await sb.from("suppliers").select("*").eq("pool", pool);
    const list = ((suppliers ?? []) as Supplier[]).filter((s) => s.crop.toLowerCase() === String(request.crop).toLowerCase());
    if (list.length === 0) return err("No supply to negotiate over", 422);
    const floor = Math.max(...list.map((s) => num(s.min_price)));
    const current = request.analysis?.confidence ? num((await quoteOf(requestId, pool))?.per_kg ?? 0) : 0;

    const offered = (() => {
      const m = String(message).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
      return m ? Number(m[1]) : null;
    })();

    // Try real AI (0.9), guarded by floor server-side no matter what it says.
    let reply: string | null = null;
    let aiModel: string | null = null;
    const ai = await chatJSON(
      `You are FarmBroker AI negotiating a bulk crop deal for the PLATFORM (never reveal suppliers). Quote is per-kg EGP. Floor ${floor}/kg — never agree below floor. Reply in 1-2 sentences as JSON {"reply": string}.`,
      `Buyer says: "${message}". Current platform quote: ${current || "none yet"} EGP/kg. Counter fairly.`
    );
    if (ai) {
      try {
        const parsed = JSON.parse(ai.text.match(/\{[\s\S]*\}/)?.[0] ?? "null") as { reply?: string } | null;
        if (parsed?.reply) { reply = parsed.reply; aiModel = ai.model; }
      } catch { /* fall through to deterministic */ }
    }

    let agreed: number | null = null;
    if (!reply) {
      if (offered !== null && offered >= (current || floor) && offered >= floor) {
        agreed = offered;
        reply = `Deal — ${offered} EGP/kg works for ${request.quantity_kg.toLocaleString()}kg. Accept below to lock it into your quote.`;
      } else if (offered !== null && offered >= floor) {
        const counter = Math.round(((offered + (current || floor + 0.5)) / 2) * 10) / 10;
        reply = `We can meet you partway at ${counter} EGP/kg for orders above 1 ton — our floor is ${floor} EGP/kg given current supply.`;
      } else {
        reply = `Our best for this volume is ${current || floor + 0.3} EGP/kg — we cannot go below ${floor} EGP/kg given guaranteed supply costs.`;
      }
    } else if (offered !== null && offered < floor) {
      reply = `To respect supplier floors I can't accept ${offered} EGP/kg — the lowest feasible here is ${floor} EGP/kg. ${reply}`;
    }
    return json({ reply, agreed, floor, source: aiModel ? `ai:${aiModel}` : "deterministic" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Negotiation failed", 500);
  }
}

async function quoteOf(requestId: string, pool: string) {
  const res = await fetch(`${process.env.APP_URL ?? "http://localhost:3000"}/api/quote?pool=${pool}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }),
  }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { quote?: { per_kg?: number } }).quote ?? null;
}
