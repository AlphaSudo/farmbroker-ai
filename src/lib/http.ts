// Tiny JSON helpers for route handlers.
export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const err = (message: string, status = 400) => Response.json({ error: message }, { status });
export const poolOf = (url: string): "demo" | "full" => (new URL(url).searchParams.get("pool") === "full" ? "full" : "demo");
