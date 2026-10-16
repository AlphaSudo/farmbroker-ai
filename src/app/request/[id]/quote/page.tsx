"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentLog, Card, Shell, Stepper } from "@/components/ui";

interface Quote { quantity_kg: number; per_kg: number; total: number; supplier_cost: number; margin: number; market_range: [number, number]; delivery_days: number; quotable: boolean; reason?: string; }

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [q, setQ] = useState<Quote | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id }) })
      .then((r) => r.json()).then((d) => { setQ(d.quote ?? null); setLog(d.log ?? []); });
  }, [id]);

  async function approve() {
    setBusy(true);
    const res = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id }) });
    if (res.ok) router.push(`/request/${id}/pay`);
    else setBusy(false);
  }

  return (
    <Shell>
      <Stepper id={id} current="quote" />
      <h1 className="text-3xl font-bold">Supply quote</h1>
      {!q && <p className="animate-pulse">Pricing Agent working…</p>}
      {q && !q.quotable && <p className="text-red-300">{q.reason}</p>}
      {q?.quotable && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card title="Quantity" big>{q.quantity_kg.toLocaleString()}kg</Card>
            <Card title="Price (guaranteed)" big>{q.total.toLocaleString()} EGP</Card>
            <Card title="Delivery" big>{q.delivery_days} days</Card>
            <Card title="Per kg" big>{q.per_kg} EGP</Card>
          </div>
          <div className="rounded-2xl bg-emerald-900/60 p-5 text-sm text-emerald-100">
            Market range (mock): {q.market_range[0]}–{q.market_range[1]} EGP/kg ·
            Cost pool {q.supplier_cost.toLocaleString()} + platform margin {q.margin.toLocaleString()} = {q.total.toLocaleString()} EGP.
            Sourced from FarmBroker Supply Network.
          </div>
          <AgentLog lines={log} />
          <div className="flex gap-3">
            <button onClick={approve} disabled={busy} className="rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">
              {busy ? "Locking…" : "Approve Pricing →"}</button>
            <a href={`/request/${id}/negotiate`} className="rounded-full border border-emerald-600 px-6 py-3">Negotiate first</a>
          </div>
        </>
      )}
    </Shell>
  );
}
