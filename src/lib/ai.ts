// Server-only OpenRouter JSON adapter. Each configured model is tried once.
// Budgets (2.5): 8s per call, max 2 calls per operation, 25s overall deadline enforced
// by callers. AI_PLANNING=off disables autonomous calls (deterministic ops continue).
const BASE = process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1";
const MODELS = [...new Set([process.env.AI_MODEL_PRIMARY ?? "nvidia/nemotron-3.5-lightning:free", process.env.AI_MODEL_SECONDARY ?? "liquid/lfm-2.5-2.6b:free"])];
const CALL_TIMEOUT_MS = 8000;
export const aiOff = (): boolean => process.env.AI_PLANNING === "off";

async function callModel(model: string, system: string, user: string): Promise<{ text: string; model: string } | null> {
  const key = process.env.AI_API_KEY;
  if (!key || aiOff()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`, "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000", "X-Title": "FarmBroker AI",
      },
      // Optional output/reasoning controls are not portable across providers.
      // Liquid's tested fallback uses prompted JSON; every caller still validates.
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 1200, temperature: 0.2,
        ...(model.startsWith("liquid/") ? {} : { reasoning: { enabled: false }, response_format: { type: "json_object" } }) }),
    });
    if (!res.ok) { console.warn("AI provider rejected request", { model, status: res.status }); return null; }
    const data = (await res.json()) as { model?: string; choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    return text ? { text, model: data.model ?? model } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function chatJSON(system: string, user: string): Promise<{ text: string; model: string } | null> {
  if (aiOff()) return null;
  let calls = 0;
  for (const model of MODELS) {
    if (++calls > 2) break; // bounded fallback chain (2.5)
    const response = await callModel(model, system, user);
    if (response) return response;
  }
  return null;
}
