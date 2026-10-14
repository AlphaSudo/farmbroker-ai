"use client";
import { useEffect, useState } from "react";
import { hubHeaders } from "@/lib/auth/hub-client";

interface Deal { id: string; status: string; outcome: string; total_price: number; }

export default function HubOrders() {
  const [key, setKey] = useState("");
  const [unlocked, setUnlocked] = useState(() => typeof window !== "undefined" && !!window.sessionStorage.getItem("fb_hub_key"));
  const [q, setQ] = useState<{ pendingInspections: number; shortDeals: unknown[]; incidents: Array<{ id: string; deal_id: string; missing_kg: number; status: string }>; refunds: Array<{ id: string; deal_id: string; status: string }>; deals: Deal[] } | null>(null);
  const [msg, setMsg] = useState("");

  async function load(k?: string) {
    const r = await fetch("/api/hub/queue", { headers: k ? { "x-hub-key": k } : hubHeaders() }).then((x) => x.json());
    if (r.deals) { setQ(r); setMsg(""); }
    else setMsg(r.error ?? "Hub key required");
  }
  function unlock() {
    window.sessionStorage.setItem("fb_hub_key", key);
    setUnlocked(true); load(key);
  }
  useEffect(() => {
    if (!unlocked) return;
    fetch("/api/hub/queue", { headers: hubHeaders() }).then((x) => x.json()).then((r) => {
      if (r.deals) setQ(r); else setMsg(r.error ?? "Hub key required");
    });
  }, [unlocked]);

  return (
    <div className="min-h-screen bg-emerald-950 font-sans text-emerald-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <h1 className="text-3xl font-bold">Hub — Operations Queue</h1>
        {!unlocked && (
          <div className="flex gap-2 rounded-2xl bg-emerald-900/60 p-4">
            <input type="password" placeholder="Hub key (HUB_KEY)" value={key} onChange={(e) => setKey(e.target.value)} className="flex-1 rounded-lg bg-emerald-950 px-3 py-2" />
            <button onClick={unlock} className="rounded-full bg-amber-400 px-5 py-2 font-bold text-emerald-950">Unlock Hub</button>
          </div>
        )}
        {msg && <p className="text-amber-200">{msg}</p>}
        {q && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-emerald-900/60 p-4">Pending inspections: <b className="text-amber-300">{q.pendingInspections}</b></div>
              <div className="rounded-2xl bg-emerald-900/60 p-4">Short orders: <b className="text-amber-300">{q.shortDeals.length}</b></div>
              <div className="rounded-2xl bg-emerald-900/60 p-4">Open incidents: <b className="text-amber-300">{q.incidents.length}</b></div>
              <div className="rounded-2xl bg-emerald-900/60 p-4">Refunds watch: <b className="text-amber-300">{q.refunds.length}</b></div>
            </div>
            {q.incidents.map((i) => <p key={i.id} className="text-amber-200">Incident {i.id.slice(0, 8)}: {Number(i.missing_kg).toLocaleString()}kg short — {i.status} (deal {i.deal_id.slice(0, 8)})</p>)}
            <table className="w-full text-sm">
              <thead><tr className="text-left text-emerald-300"><th>Deal</th><th>Status</th><th>Outcome</th><th>Total</th><th></th></tr></thead>
              <tbody>{q.deals.map((d) => (
                <tr key={d.id} className="border-t border-emerald-900">
                  <td className="font-mono">{d.id.slice(0, 8)}</td><td>{d.status}</td><td>{d.outcome}</td>
                  <td>{Number(d.total_price).toLocaleString()}</td>
                  <td><a className="text-amber-300" href={`/hub/orders/${d.id}/finance`}>Finance →</a></td>
                </tr>))}</tbody>
            </table>
          </>
        )}
      </main>
    </div>
  );
}
