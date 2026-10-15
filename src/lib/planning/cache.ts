// Planning cache + single-flight (2.5). Keys cover spec, evidence, policy, model,
// prompt, and lot versions; reuse still requires commit-time revalidation.
import { hashOf } from "../ai/decisions";

const inflight = new Map<string, Promise<unknown>>();
const MAX_INFLIGHT = 32;

export const planningKey = (parts: object): string => hashOf(parts);

export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<{ result: T; shared: boolean }> {
  const hit = inflight.get(key) as Promise<T> | undefined;
  if (hit) return { result: await hit, shared: true };
  if (inflight.size >= MAX_INFLIGHT) return { result: await fn(), shared: false };
  const p = fn().finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return { result: await p, shared: false };
}
