"use client";
import { useEffect, useState } from "react";
import { hubHeaders } from "@/lib/auth/hub-client";

export default function HubFinance({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [d, setD] = useState<{
    deal?: { id: string; status: string; outcome: string; total_price: number; paypal_capture_id: string | null; paypal_verified?: { amount: string; currency: string; payee: string } | null };
    attempts?: Array<{ id: string; status: string; usd_minor: number; provider_order_id: string | null }>;
    ledger?: Array<{ kind: string; egp_minor: number; usd_minor: number; note: string }>;
    refunds?: Array<{ id: string; status: string; usd_minor: number; provider_refund_id: string | null; reason: string }>;
    events?: Array<{ type: string; payload: object; created_at: string }>;
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);
  async function load() {
    if (!id) return;
    const r = await fetch(`/api/hub/deals?dealId=${id}`, { headers: hubHeaders() }).then((x) => x.json());
    if (r.deal) setD(r); else setMsg(r.error ?? "Hub key required — unlock at /hub/orders first.");
  }
  useEffect(() => {
    if (!id) return;
    fetch(`/api/hub/deals?dealId=${id}`, { headers: hubHeaders() }).then((x) => x.json()).then((r) => {
      if (r.deal) setD(r); else setMsg(r.error ?? "Hub key required — unlock at /hub/orders first.");
    });
  }, [id]);
  async function act(path: string, body: object, label: string) {
    setMsg(`${label}…`);
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...hubHeaders() }, body: JSON.stringify(body) });
    const j = await r.json();
    setMsg(r.ok ? `${label}: OK` : (j.error ?? "failed"));
    load();
  }
  return (
    <div className="min-h-screen bg-emerald-950 font-sans text-emerald-50">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-10">
        <a href="/hub/orders" className="text-sm text-emerald-300">← Queue</a>
        <h1 className="font-mono text-2xl font-bold">Deal {id.slice(0, 13)}…</h1>
        {msg && <p className="text-amber-200">{msg}</p>}
        {d?.deal && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-emerald-900/60 p-4">Status: <b>{d.deal.status}</b></div>
              <div className="rounded-2xl bg-emerald-900/60 p-4">Outcome: <b className="text-amber-300">{d.deal.outcome}</b></div>
              <div className="rounded-2xl bg-emerald-900/60 p-4">Total: <b>{Number(d.deal.total_price).toLocaleString()} EGP</b></div>
              <div className="rounded-2xl bg-emerald-900/60 p-4">Capture: <b className="font-mono text-xs">{d.deal.paypal_capture_id ?? "—"}</b></div>
            </div>
            {d.deal.paypal_verified && <p className="text-sm text-emerald-200">Verified: {d.deal.paypal_verified.amount} {d.deal.paypal_verified.currency} · payee {d.deal.paypal_verified.payee}</p>}
            <h2 className="font-bold">Payment attempts</h2>
            {(d.attempts ?? []).map((a) => <p key={a.id} className="font-mono text-xs text-emerald-200">{a.provider_order_id} — {a.status} — {(a.usd_minor / 100).toFixed(2)} USD</p>)}
            <h2 className="font-bold">Ledger (append-only)</h2>
            {(d.ledger ?? []).map((l, i) => <p key={i} className="font-mono text-xs text-emerald-200">{l.kind}: EGP {(l.egp_minor / 100).toFixed(2)} · USD {(l.usd_minor / 100).toFixed(2)} — {l.note}</p>)}
            <h2 className="font-bold">Refunds</h2>
            {(d.refunds ?? []).map((r) => <p key={r.id} className="font-mono text-xs text-emerald-200">{r.status} — {(r.usd_minor / 100).toFixed(2)} USD — {r.provider_refund_id ?? "pending"} — {r.reason}</p>)}
            <h2 className="font-bold">Events</h2>
            {(d.events ?? []).map((e, i) => <p key={i} className="font-mono text-xs text-emerald-300">{e.type} · {String(e.created_at).slice(0, 19).replace("T", " ")}</p>)}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => act("/api/handover", { dealId: id }, "Handover")} className="rounded-full bg-amber-400 px-5 py-2 font-bold text-emerald-950">Record simulated handover</button>
              <button onClick={() => act("/api/paypal/reconcile", { dealId: id }, "Reconcile")} className="rounded-full border border-emerald-600 px-5 py-2">Reconcile vs PayPal</button>
            </div>
            <div className="flex gap-2 rounded-2xl bg-emerald-900/60 p-4">
              <input placeholder="Refund reason (policy-gated)" value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1 rounded-lg bg-emerald-950 px-3 py-2" />
              <button onClick={() => act("/api/refunds", { dealId: id, reason }, "Refund")} className="rounded-full border border-red-400 px-5 py-2 text-red-300">Request full refund</button>
            </div>
            <p className="text-xs text-emerald-400">Supplier entitlements stay payable after a buyer refund (platform exposure). Accepted payables are obligations, not sent payouts.</p>
          </>
        )}
      </main>
    </div>
  );
}
