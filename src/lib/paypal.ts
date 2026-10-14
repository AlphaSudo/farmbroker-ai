// PayPal Sandbox — Orders v2 (Create → Approve → Capture). Payee = platform. Currency USD.
// Demo conversion (documented): EGP / 48 = USD. 78,000 EGP → 1,625.00 USD.
export const EGP_PER_USD = 48;
export const egpToUsd = (egp: number): string => (egp / EGP_PER_USD).toFixed(2);

const BASE = "https://api-m.sandbox.paypal.com";
let token: { value: string; exp: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.exp) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!id || !secret) throw new Error("Missing PAYPAL_CLIENT_ID / PAYPAL_SECRET");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

export async function createOrder(dealId: string, totalEgp: number, requestId?: string) {
  const access = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
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
  if (!res.ok) throw new Error(`PayPal create-order failed (${res.status})`);
  return (await res.json()) as { id: string };
}

export async function captureOrder(orderId: string) {
  const access = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`PayPal capture failed (${res.status})`);
  const data = (await res.json()) as { id: string; purchase_units?: Array<{ payments?: { captures?: Array<{ id: string }> } }> };
  const captureId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? "";
  return { orderId: data.id, captureId };
}

export interface VerifiedCapture { ok: boolean; captureId: string; status: string; amount: string; currency: string; payeeEmail: string; reason?: string; }

// Full binding check: COMPLETED + amount + currency + platform payee (1.1/1.5).
export async function verifyCapture(orderId: string, expectedUsd: string, merchantEmail: string): Promise<VerifiedCapture> {
  const access = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}`, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) return { ok: false, captureId: "", status: "", amount: "", currency: "", payeeEmail: "", reason: `order lookup failed (${res.status})` };
  const o = (await res.json()) as {
    status: string; purchase_units: Array<{ amount: { currency_code: string; value: string }; payee?: { email_address?: string }; payments?: { captures?: Array<{ id: string; status: string; amount: { value: string; currency_code: string } }> } }>;
  };
  const pu = o.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  const payeeEmail = pu?.payee?.email_address ?? "";
  if (!cap) return { ok: false, captureId: "", status: o.status, amount: "", currency: "", payeeEmail, reason: "no capture on order" };
  if (cap.status !== "COMPLETED") return { ok: false, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail, reason: `capture status ${cap.status}` };
  if (cap.amount.value !== expectedUsd || cap.amount.currency_code !== "USD") return { ok: false, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail, reason: "amount/currency mismatch" };
  if (merchantEmail && payeeEmail && payeeEmail.toLowerCase() !== merchantEmail.toLowerCase()) return { ok: false, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail, reason: "payee mismatch" };
  return { ok: true, captureId: cap.id, status: cap.status, amount: cap.amount.value, currency: cap.amount.currency_code, payeeEmail };
}

export async function refundCapture(captureId: string, usdValue: string, requestId?: string) {
  const access = await getAccessToken();
  const res = await fetch(`${BASE}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`, "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: JSON.stringify({ amount: { currency_code: "USD", value: usdValue } }),
  });
  if (!res.ok) throw new Error(`PayPal refund failed (${res.status})`);
  return (await res.json()) as { id: string; status: string };
}

export async function getRefund(refundId: string) {
  const access = await getAccessToken();
  const res = await fetch(`${BASE}/v2/payments/refunds/${refundId}`, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) throw new Error(`Refund lookup failed (${res.status})`);
  return (await res.json()) as { id: string; status: string };
}
