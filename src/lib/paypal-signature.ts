// Native PayPal webhook verification (2.3): RSA-SHA256 over
// transmission_id|transmission_time|webhook_id|crc32(raw body), per PayPal docs.
// Certificates origin/path-checked, validity-checked, cached within validity.
import { createVerify, X509Certificate, generateKeyPairSync, createSign } from "crypto";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
export const crc32 = (s: string): number => {
  const buf = Buffer.from(s, "utf8");
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const certCache = new Map<string, { pem: string; exp: number }>();

async function fetchCert(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("cert must be https");
  const origins = new Set(["api.paypal.com", "api-m.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"]);
  if (!origins.has(u.hostname) || !/^\/(?:v1\/notifications\/)?certs\/CERT-[a-zA-Z0-9-]+$/.test(u.pathname)
    || u.username || u.password || u.port || u.search || u.hash) throw new Error("cert origin/path rejected");
  const cached = certCache.get(url);
  if (cached && Date.now() < cached.exp) return cached.pem;
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
  if (res.status >= 300 && res.status < 400) throw new Error("cert redirect rejected");
  if (!res.ok) throw new Error(`cert fetch failed (${res.status})`);
  const pem = await res.text();
  if (Buffer.byteLength(pem) > 65536) throw new Error("certificate too large");
  if (!pem.includes("BEGIN CERTIFICATE")) throw new Error("not a certificate");
  const x = new X509Certificate(pem);
  const now = new Date();
  if (new Date(x.validFrom) > now || new Date(x.validTo) < now) throw new Error("certificate outside validity");
  if (certCache.size >= 8) certCache.delete(certCache.keys().next().value!);
  certCache.set(url, { pem, exp: Math.min(new Date(x.validTo).getTime(), Date.now() + 3600000) });
  return pem;
}

export async function verifyNativeSignature(input: {
  transmissionId: string | null; transmissionTime: string | null; certUrl: string | null;
  authAlgo: string | null; signature: string | null; webhookId: string; rawBody: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { transmissionId, transmissionTime, certUrl, authAlgo, signature, webhookId, rawBody } = input;
  if (!transmissionId || !transmissionTime || !certUrl || !signature) return { ok: false, reason: "missing transmission headers" };
  if (authAlgo !== "SHA256withRSA") return { ok: false, reason: "unsupported or missing algorithm" };
  try {
    const pem = await fetchCert(certUrl);
    const payload = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32(rawBody)}`;
    const v = createVerify("RSA-SHA256");
    v.update(payload, "utf8");
    const ok = v.verify(pem, Buffer.from(signature, "base64"));
    return ok ? { ok: true } : { ok: false, reason: "signature mismatch" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "verification error" };
  }
}

// Self-check (offline): sign with an ephemeral key, verify — proves mechanics, not PayPal vectors.
export function selfCheck(): boolean {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const payload = "tid|ttime|wh_1|12345";
  const s = createSign("RSA-SHA256");
  s.update(payload, "utf8");
  const sig = s.sign(privateKey);
  const v = createVerify("RSA-SHA256");
  v.update(payload, "utf8");
  return v.verify(publicKey, sig);
}
