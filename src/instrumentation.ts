// Request/SQL/provider timing + correlation IDs (2.0). No briefs, keys, or raw payloads in logs.
export function requestId(): string { return globalThis.crypto.randomUUID(); }

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

export function serverTiming(parts: Array<[string, number]>): string {
  return parts.map(([k, ms]) => `${k};dur=${ms}`).join(", ");
}
