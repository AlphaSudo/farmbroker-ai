// OpenRouter client (best free key). Primary inkling → fallback nemotron → null.
// Same JSON schema as deterministic logic; 8s timeout; server-only key.
const BASE = process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1";
const MODELS = [process.env.AI_MODEL_PRIMARY ?? "thinkingmachines/inkling:free", process.env.AI_MODEL_SECONDARY ?? "nvidia/nemotron-3.5-lightning:free"];

async function callModel(model: string, system: string, user: string): Promise<string | null> {
  const key = process.env.AI_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`, "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000", "X-Title": "FarmBroker AI",
      },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 400, temperature: 0.3 }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function chatJSON(system: string, user: string): Promise<{ text: string; model: string } | null> {
  for (const model of MODELS) {
    const text = await callModel(model, system, user);
    if (text) return { text, model };
  }
  return null;
}
