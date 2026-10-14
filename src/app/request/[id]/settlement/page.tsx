"use client";
import { useEffect, useState } from "react";
import { AgentLog, Card, Shell, Stepper } from "@/components/ui";

interface Payout { label: string; kg: number; amount: number; grade: string | null; status: string; }

export default function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [deal, setDeal] = useState<{ id: string; total_price: number; paypal_capture_id: string | null; outcome: string } | null>(null);
  const [s, setS] = useState<{ total: number; payouts: Payout[]; margin: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/requests/${id}`).then((r) => r.json()).then((d) => setDeal(d.deal));
  }, [id]);

  async function run() {
    if (!deal) return;
    setBusy(true); setError("");
    const r = await fetch("/api/settle?view=buyer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: deal.id }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "Failed"); return; }
    setS(d);
  }

  return (
    <Shell>
      <Stepper id={id} current="settlement" />
      <h1 className="text-3xl font-bold">Settlement</h1>
      <p className="text-sm text-emerald-300">Suppliers are paid only after inspection. Payouts calculated — Ready for PayPal Payout (not auto-sent in MVP).</p>
      {!s && <button onClick={run} disabled={busy || !deal} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">{busy ? "Settling…" : "Run Settlement"}</button>}
      {error && <p className="text-red-300">{error}</p>}
      {s && deal && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card title="Buyer Payment" big>{s.total.toLocaleString()} EGP</Card>
            <Card title="Supplier Payments" big>{s.payouts.reduce((x, p) => x + p.amount, 0).toLocaleString()} EGP</Card>
            <Card title="Platform Margin" big>{s.margin.toLocaleString()} EGP</Card>
          </div>
          <div className="grid gap-3">
            {s.payouts.map((p) => (
              <div key={p.label} className="rounded-2xl bg-emerald-900/60 p-4">
                <div className="flex justify-between"><b>{p.label}</b><b className="text-amber-300">{p.amount.toLocaleString()} EGP</b></div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-emerald-950">
                  <div className="h-full bg-amber-400" style={{ width: `${Math.round((p.amount / s.total) * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-emerald-300">{p.kg.toLocaleString()}kg{ p.grade ? ` · Grade ${p.grade}` : ""} · {p.status}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-emerald-200">How we make money: spread 0.3 EGP/kg (7.8 quote vs 7.5 clearing). PayPal capture: <span className="font-mono">{deal.paypal_capture_id ?? "—"}</span></p>
          <AgentLog lines={[`Finance Agent: payouts ${s.payouts.map((p) => `${p.label.split(" ")[1] ?? ""} ${p.amount}`).join(" / ")}.`, `Finance Agent: margin ${s.margin.toLocaleString()} EGP retained (gross spread, pre-fee).`]} />
          <div className="rounded-2xl border border-amber-500/60 p-5 text-center">
            <p className="font-bold text-amber-300">Network shares · 1 Buyer · {s.total.toLocaleString()} EGP · Settlement calculated{deal.outcome === "fulfilled" ? " — Completed ✅" : " — awaiting Hub handover"}</p>
            <p className="mt-1 text-xs text-emerald-300">Supplier payouts simulated (Ready for PayPal Payout). Gross spread shown before fees/costs.</p>
            <button onClick={() => window.print()} className="mt-3 rounded-full border border-emerald-600 px-6 py-2">Download Receipt / Print</button>
          </div>
        </>
      )}
    </Shell>
  );
}
