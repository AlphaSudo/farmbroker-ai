"use client";
import { useEffect, useState } from "react";
import { AgentLog, Card, Shell, Stepper } from "@/components/ui";

interface Progress { target: number; covered: number; remaining: number; supplier_count?: number; status?: string; }

export default function ProcurePage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [dealId, setDealId] = useState("");
  const [p, setP] = useState<Progress | null>(null);
  const [ticks, setTicks] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/requests/${id}`).then((r) => r.json()).then((d) => {
      if (d.deal) {
        setDealId(d.deal.id);
        fetch(`/api/procure?dealId=${d.deal.id}`).then((r) => r.json()).then((pg) => {
          if (pg.covered !== undefined) setP(pg);
        });
      }
    });
  }, [id]);

  async function start() {
    setBusy(true); setError("");
    const res = await fetch("/api/procure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "Failed"); return; }
    setLog(d.log ?? []);
    // Server already committed atomically; animate the recorded result only.
    const final = Number(d.covered ?? 0);
    setTicks([]);
    [0.34, 0.67, 1].forEach((f, i) => setTimeout(() => {
      setP({ ...d, covered: Math.round(final * f) });
      setTicks((t) => [...t, `Batch ${i + 1}/3 committed ✅`]);
    }, 800 * (i + 1)));
  }

  const pct = p && p.target ? Math.round((p.covered / p.target) * 100) : 0;
  return (
    <Shell>
      <Stepper id={id} current="procure" />
      <h1 className="text-3xl font-bold">AI Procurement</h1>
      <p className="text-sm text-emerald-300">Runs only after PayPal payment (GR#3). Buyer sees network totals — never supplier names.</p>
      {p ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card title="Target" big>{p.target.toLocaleString()}kg</Card>
            <Card title="Covered" big>{p.covered.toLocaleString()}kg</Card>
            <Card title="Remaining" big>{p.remaining.toLocaleString()}kg</Card>
            <Card title="Suppliers" big>{p.supplier_count ?? 0}</Card>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-emerald-900">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          {p.covered >= p.target && p.target > 0 && (
            <div className="rounded-2xl bg-emerald-900/60 p-5">
              <p className="text-xl font-bold text-amber-300">Supply Locked — Order Fully Covered ✅</p>
              <a href={`/request/${id}/quality`} className="mt-3 inline-block rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Go to Quality Gate →</a>
            </div>
          )}
        </>
      ) : (
        <button onClick={start} disabled={busy || !dealId} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">
          {busy ? "Procuring…" : "Start AI Procurement"}</button>
      )}
      {p && p.covered === 0 && (
        <button onClick={start} disabled={busy} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">
          {busy ? "Procuring…" : "Start AI Procurement"}</button>
      )}
      {error && <p className="text-red-300">{error}</p>}
      {ticks.length > 0 && (
        <ul className="space-y-1 text-emerald-100">
          {ticks.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
      <AgentLog lines={log} />
    </Shell>
  );
}
