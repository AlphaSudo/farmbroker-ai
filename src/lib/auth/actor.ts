// Actor context (1.1 minimum): guest buyer ownership via signed cookie token;
// Hub operations via server-checked HUB_KEY header. Never trust `view`/UUID alone.
import { cookies } from "next/headers";

export async function buyerToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("fb_buyer")?.value ?? null;
}

export function hubAuthorized(req: Request): boolean {
  const key = process.env.HUB_KEY;
  if (!key) return false;
  return req.headers.get("x-hub-key") === key;
}
