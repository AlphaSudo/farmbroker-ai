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

export async function createOrder(dealId: string, totalEgp: number) {
  const access = await getAccessToken();
  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
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
