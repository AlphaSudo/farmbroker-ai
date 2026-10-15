// Offline cryptographic regression tests, using ephemeral TEST-STUB certificates.
// These prove implementation mechanics, not authentic PayPal-event acceptance.
import { mkdtempSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createSign } from "node:crypto";
import assert from "node:assert/strict";
import { crc32, verifyNativeSignature } from "../src/lib/paypal-signature";

const dir = mkdtempSync(join(tmpdir(), "fb-signature-"));
const originalFetch = globalThis.fetch;
let pass = 0;
try {
  const openssl = process.env.OPENSSL_BINARY ?? (process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl");
  const certificates = [0, 1].map(n => {
    const key = join(dir, "key" + n + ".pem"); const cert = join(dir, "cert" + n + ".pem");
    const result = spawnSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert, "-sha256", "-days", "1", "-nodes", "-subj", "/CN=FarmBroker-TEST-STUB"], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error("Ephemeral certificate creation failed; configure OPENSSL_BINARY");
    return { key: readFileSync(key, "utf8"), cert: readFileSync(cert, "utf8") };
  });
  const calls: string[] = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input); calls.push(url);
    assert.equal(options?.redirect, "manual"); assert.ok(options?.signal);
    if (url.endsWith("CERT-redirect")) return new Response("", { status: 302 });
    return new Response(certificates[url.endsWith("CERT-two") ? 1 : 0].cert);
  };
  const rawBody = '{"id":"TEST-STUB","summary":"نعناع"}';
  const payload = "tid|2026-10-16T00:00:00Z|wh-test|" + crc32(rawBody);
  const signed = (n: number) => createSign("RSA-SHA256").update(payload).sign(certificates[n].key, "base64");
  const input = { transmissionId: "tid", transmissionTime: "2026-10-16T00:00:00Z", certUrl: "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-one", authAlgo: "SHA256withRSA", signature: signed(0), webhookId: "wh-test", rawBody };
  const check = (name: string, condition: boolean) => { assert.ok(condition, name); pass++; console.log("PASS " + name); };
  check("CRC32 known vector", crc32("123456789") === 3421780262);
  check("Documented algorithm/path verifies ephemeral signed bytes", (await verifyNativeSignature(input)).ok);
  check("Modified raw byte is rejected", !(await verifyNativeSignature({ ...input, rawBody: rawBody + " " })).ok);
  check("Wrong webhook identity is rejected", !(await verifyNativeSignature({ ...input, webhookId: "wrong" })).ok);
  check("Unsupported algorithm is rejected", !(await verifyNativeSignature({ ...input, authAlgo: "SHA1withRSA" })).ok);
  check("Missing algorithm is rejected", !(await verifyNativeSignature({ ...input, authAlgo: null })).ok);
  check("Untrusted certificate host is rejected", !(await verifyNativeSignature({ ...input, certUrl: "https://example.com/v1/notifications/certs/CERT-one" })).ok);
  check("Wrong certificate path is rejected", !(await verifyNativeSignature({ ...input, certUrl: "https://api-m.sandbox.paypal.com/other/CERT-one" })).ok);
  check("Certificate redirect is rejected", !(await verifyNativeSignature({ ...input, certUrl: "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-redirect" })).ok);
  check("Rotation loads the certificate for its own URL", (await verifyNativeSignature({ ...input, certUrl: "https://api-m.sandbox.paypal.com/v1/notifications/certs/CERT-two", signature: signed(1) })).ok);
  check("Cached original certificate remains correct", (await verifyNativeSignature(input)).ok);
  check("Repeated verification reuses URL-specific cache", calls.filter(u => u.endsWith("CERT-one")).length === 1);
  console.log(JSON.stringify({ pass, fail: 0, providerMode: "offline ephemeral certificates" }));
} finally {
  globalThis.fetch = originalFetch;
  const resolved = realpathSync(dir); const tempBase = realpathSync(tmpdir());
  if (!resolved.startsWith(tempBase + sep) || !basename(resolved).startsWith("fb-signature-")) throw new Error("Unexpected temporary cleanup path");
  rmSync(resolved, { recursive: true });
}
