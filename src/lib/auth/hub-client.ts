// Client-safe Hub key header (no next/headers import — safe for "use client" pages).
export function hubHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const k = window.sessionStorage.getItem("fb_hub_key") ?? "";
  return k ? { "x-hub-key": k } : {};
}
