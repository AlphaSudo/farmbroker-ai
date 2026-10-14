"use client";
import { useEffect, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { Card, Shell, Stepper } from "@/components/ui";

export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [deal, setDeal] = useState<{ id: string; total_price: number; status: string; paypal_capture_id: string | null } | null>(null);
  const [req, setReq] = useState<{ crop: string; quantity_kg: number; delivery_days: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/requests/${id}`).then((r) => r.json()).then((d) => { setReq(d.request); setDeal(d.deal); if (d.deal?.paypal_capture_id) setDone(d.deal.paypal_capture_id); });
  }, [id]);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";
  return (
    <Shell>
      <Stepper id={id} current="pay" />
      <h1 className="text-3xl font-bold">Pay with PayPal</h1>
      <p className="rounded-full border border-amber-500/60 px-3 py-1 text-xs text-amber-300 w-fit">SANDBOX — no real money</p>
      {req && deal && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card title="Order">{`${req.crop} ${Number(req.quantity_kg).toLocaleString()}kg / ${req.delivery_days}d`}</Card>
          <Card title="Total (EGP)" big>{Number(deal.total_price).toLocaleString()}</Card>
          <Card title="USD charged (demo rate 48)">≈ {(Number(deal.total_price) / 48).toFixed(2)} USD</Card>
        </div>
      )}
      {!done && deal && deal.status === "quoted" && (
        <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture" }}>
          <PayPalButtons
            createOrder={async () => {
              const r = await fetch("/api/paypal/create-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: deal.id }) });
              const d = await r.json();
              if (!r.ok) { setError(d.error ?? "Order failed"); throw new Error(d.error); }
              return d.orderId as string;
            }}
            onApprove={async (data) => {
              const r = await fetch("/api/paypal/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: data.orderID }) });
              const d = await r.json();
              if (!r.ok) { setError(d.error ?? "Capture failed"); return; }
              setDone(d.captureId);
            }}
            onError={() => setError("Payment failed — use the sandbox personal test account.")}
          />
        </PayPalScriptProvider>
      )}
      {error && <p className="text-red-300">{error}</p>}
      {done && (
        <div className="rounded-2xl bg-emerald-900/60 p-6">
          <p className="text-2xl font-bold text-amber-300">Payment Success — Order Confirmed ✅</p>
          <p className="mt-2 font-mono text-sm text-emerald-200">capture {done}</p>
          <a href={`/request/${id}/procure`} className="mt-4 inline-block rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Watch AI Procurement →</a>
        </div>
      )}
    </Shell>
  );
}
