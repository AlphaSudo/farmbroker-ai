"use client";
import { useEffect, useState } from "react";
import { Shell, Stepper } from "@/components/ui";

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [d, setD] = useState<{ request?: { crop: string; quantity_kg: number; delivery_days: number; buyer_name: string }; deal?: { total_price: number; per_kg: number; paypal_capture_id: string | null } } | null>(null);
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/requests/${id}`).then((r) => r.json()).then(setD);
  }, [id]);
  const usd = d?.deal ? (Number(d.deal.total_price) / 48).toFixed(2) : "—";
  return (
    <Shell>
      <Stepper id={id} current="request" />
      <h1 className="text-3xl font-bold">Export Offer (vision preview)</h1>
      <p className="rounded-xl border border-dashed border-emerald-700 p-3 text-sm text-emerald-300">Domestic fulfillment only in MVP. Today our AI serves local buyers — tomorrow an AI-powered export company.</p>
      <div className="rounded-2xl bg-white p-8 text-slate-900">
        <h2 className="text-2xl font-bold">FarmBroker AI — Commercial Offer</h2>
        <p className="mt-1 text-sm text-slate-500">Generated for international buyer outreach · PayPal-secured</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Product</dt><dd className="font-bold">Premium {d?.request?.crop ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Quantity</dt><dd className="font-bold">{d?.request ? Number(d.request.quantity_kg).toLocaleString() : "—"} kg</dd></div>
          <div><dt className="text-slate-500">Delivery</dt><dd className="font-bold">{d?.request?.delivery_days ?? "—"} days ex-hub</dd></div>
          <div><dt className="text-slate-500">Price</dt><dd className="font-bold">${usd} USD (PayPal invoice)</dd></div>
        </dl>
        <p className="mt-4 text-sm">Dear buyer, FarmBroker AI guarantees aggregated, quality-inspected supply from its audited network. Target lanes: UAE · Saudi Arabia · Germany. Reply to receive a PayPal payment link.</p>
      </div>
      <button onClick={() => window.print()} className="w-fit rounded-full border border-emerald-600 px-6 py-2">Print / Save PDF</button>
    </Shell>
  );
}
