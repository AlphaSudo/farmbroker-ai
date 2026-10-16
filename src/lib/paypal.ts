// PayPal Sandbox — Orders v2 (Create → Approve → Capture). Payee = platform. Currency USD.
// Demo conversion (documented): EGP / 48 = USD. 78,000 EGP → 1,625.00 USD.
export const EGP_PER_USD = 48;
export const egpToUsd = (egp: number): string => (egp / EGP_PER_USD).toFixed(2);

const BASE = "https://api-m.sandbox.paypal.com";
const TIMEOUT_MS = 15000;

// Bounded provider I/O (2.3): every call has a finite deadline; no hanging sockets.
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("provider timeout")), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Retry classification (2.3): network errors, 429 (honoring Retry-After), and 5xx retry
// with the SAME operation key; 4xx never retries (except 429). Max 3 attempts.
export async function providerCall<T>(op: string, key: string, fn: () => Promise<T>): Promise<T> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = (e as { status?: number })?.status;
      const retryable = e instanceof Error && (/timeout|network|fetch failed|aborted/i.test(e.message) || status === 429 || (typeof status === "number" && status >= 500));
      if (!retryable || attempt === 2) throw e;
      const wait = 500 * 2 ** attempt;
      console.warn("PayPal retry", { op, key, attempt: attempt + 1, wait });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

let token: { value: string; exp: number } | null = null;
let tokenFlight: Promise<string> | null = null; // single-flight within each warm process (2.3)

export async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.exp) return token.value;
  tokenFlight ??= (async () => {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;
    if (!id || !secret) throw new Error("Missing PAYPAL_CLIENT_ID / PAYPAL_SECRET");
    const res = await fetchWithTimeout(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
    return token.value;
  })().finally(() => { tokenFlight = null; });
  return tokenFlight;
}

export async function createOrder(dealId: string, totalEgp: number, requestId?: string) {
  const access = await getAccessToken();
  return providerCall("create-order", requestId ?? dealId, async () => {
    const res = await fetchWithTimeout(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`, "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ custom_id: dealId, description: "FarmBroker AI guaranteed supply", amount: { currency_code: "USD", value: egpToUsd(totalEgp) } }],
    }),
  });
  if (!res.ok) await providerError(res, "create-order");
  return (await res.json()) as { id: string };
  });
}

export async function captureOrder(orderId: string, requestId?: string) {
  const access = await getAccessToken();
  return providerCall("capture", requestId ?? orderId, async () => {
    const res = await fetchWithTimeout(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
    });
    if (!res.ok) await providerError(res, "capture");
    const data = (await res.json()) as { id: string; purchase_units?: Array<{ payments?: { captures?: Array<{ id: string }> } }> };
    const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? "";
    return { orderId: data.id, captureId };
  });
}

export interface VerifiedCapture { ok: boolean; captureId: string; status: string; amount: string; currency: string; payeeEmail: string; reason?: string; }

// Full binding check: COMPLETED + amount + currency + platform payee (1.1/1.5).
export async function verifyCapture(orderId: string, expectedUsd: string, merchantEmail: string, expectedDealId?: string): Promise<VerifiedCapture> {
  const access = await getAccessToken();
  const res = await fetchWithTimeout(`${BASE}/v2/checkout/orders/${orderId}`, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`PayPal order lookup temporarily unavailable (${res.status}); retry reconciliation.`), { status: 502 });
    return { ok: false, captureId: "", status: "", amount: "", currency: "", payeeEmail: "", reason: `order lookup failed (${res.status})` };
  }
  const o = (await res.json()) as {
    status: string; purchase_units: Array<{ custom_id?: string; amount: { currency_code: string; value: string }; payee?: { email_address?: string }; payments?: { captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string } }> } }>;
  };
  const pu = o.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  const payeeEmail = pu?.payee?.email_address ?? "";
  if (pu?.amount?.value !== expectedUsd || pu.amount.currency_code !== "USD" || !merchantEmail || payeeEmail.toLowerCase() !== merchantEmail.toLowerCase() || (expectedDealId && pu.custom_id !== expectedDealId)) {
    return { ok: false, captureId: "", status: o.status, amount: "", currency: "", payeeEmail, reason: "order amount/payee/deal binding mismatch" };
  }
  if (!cap) return { ok: false, captureId: "", status: o.status, amount: "", currency: "", payeeEmail, reason: "no capture on order" };
  if (cap.status !== "COMPLETED") return { ok: false, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail, reason: `capture status ${cap.status}` };
  if (cap.amount.value !== expectedUsd || cap.amount.currency_code !== "USD") return { ok: false, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail, reason: "amount/currency mismatch" };
  if (!merchantEmail || !payeeEmail || payeeEmail.toLowerCase() !== merchantEmail.toLowerCase()) return { ok: false, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail, reason: "payee mismatch" };
  if (expectedDealId && pu.custom_id !== expectedDealId) return { ok: false, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail, reason: "deal binding mismatch" };
  return { ok: true, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail };
}

// A failed verification is not permission to capture. Only an approved order
// with the complete expected binding and no existing capture can move money.
export async function captureApprovedOrder(orderId: string, expectedUsd: string, merchantEmail: string, dealId: string, operationKey: string): Promise<VerifiedCapture> {
  const verify = () => verifyCapture(orderId, expectedUsd, merchantEmail, dealId);
  let proof = await verify();
  if (proof.ok) return proof;
  if (proof.status !== "APPROVED" || proof.reason !== "no capture on order") {
    throw Object.assign(new Error(`Order is not ready for capture: ${proof.reason}.`), { status: 409 });
  }
  try {
    await captureOrder(orderId, operationKey);
  } catch (captureError) {
    // A lost response can follow a successful capture. A failed lookup must not
    // hide the original provider rejection (including its support debug ID).
    try { proof = await verify(); } catch { throw captureError; }
    if (!proof.ok) throw captureError;
    return proof;
  }
  return verify();
}

export async function refundCapture(captureId: string, usdValue: string, requestId?: string) {
  const access = await getAccessToken();
  return providerCall("refund", requestId ?? captureId, async () => {
    const res = await fetchWithTimeout(`${BASE}/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`, "Content-Type": "application/json",
        ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      },
      body: JSON.stringify({ amount: { currency_code: "USD", value: usdValue } }),
    });
    if (!res.ok) await providerError(res, "refund");
    return (await res.json()) as { id: string; status: string; amount?: { value: string; currency_code: string } };
  });
}

export async function getRefund(refundId: string) {
  const access = await getAccessToken();
  const res = await fetchWithTimeout(`${BASE}/v2/payments/refunds/${refundId}`, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) throw new Error(`Refund lookup failed (${res.status})`);
  return (await res.json()) as { id: string; status: string; amount?: { value: string; currency_code: string } };
}

async function providerError(res: Response, operation: string): Promise<never> {
  const body = await res.json().catch(() => ({})) as { details?: Array<{ issue?: string }>; debug_id?: string };
  const issue = body.details?.[0]?.issue ?? "PROVIDER_ERROR";
  console.warn("PayPal operation rejected", { operation, status: res.status, issue, debugId: body.debug_id });
  throw Object.assign(new Error(`PayPal ${operation}: ${issue}. ${issue === "COMPLIANCE_VIOLATION" ? "The sandbox account requires PayPal review; payment has not been verified." : "Retry or reconcile the existing attempt."}${body.debug_id ? ` Debug ID: ${body.debug_id}.` : ""}`), { status: res.status >= 500 ? 502 : 422 });
}
