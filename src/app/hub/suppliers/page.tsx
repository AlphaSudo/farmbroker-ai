"use client";
import { useEffect, useState } from "react";
import { hubHeaders } from "@/lib/auth/hub-client";
import SupplyGrid from "@/components/hub/SupplyGrid";

interface S { id: string; name: string; crop: string; quantity_kg: number; min_price: number; location: string | null; quality_score: number | null; pool: string; }

const DEMO = [
  { name: "Ahmed", crop: "Mint", quantity_kg: 2000, min_price: 7.0, location: "Menoufia", quality_score: 92 },
  { name: "Mohamed", crop: "Mint", quantity_kg: 3000, min_price: 7.5, location: "Menoufia", quality_score: 88 },
  { name: "Ali", crop: "Mint", quantity_kg: 5000, min_price: 7.3, location: "Giza", quality_score: 90 },
];

export default function HubSuppliers() {
  const [pool, setPool] = useState("demo");
  const [rows, setRows] = useState<S[]>([]);
  const [msg, setMsg] = useState("");
  const [key, setKey] = useState("");
  const [unlocked, setUnlocked] = useState(() => typeof window !== "undefined" && !!window.sessionStorage.getItem("fb_hub_key"));
  const [f, setF] = useState({ name: "", crop: "Mint", quantity_kg: "", min_price: "", location: "", quality_score: "" });

  async function load(p = pool) {
    const r = await fetch(`/api/hub/suppliers?pool=${p}`, { headers: hubHeaders() }).then((x) => x.json());
    if (r.suppliers) { setRows(r.suppliers); setMsg(""); }
    else setMsg(r.error ?? "Hub key required");
  }
  function unlock() {
    window.sessionStorage.setItem("fb_hub_key", key);
    setUnlocked(true);
    fetch(`/api/hub/suppliers?pool=demo`, { headers: { "x-hub-key": key } }).then((x) => x.json()).then((r) => {
      if (r.suppliers) setRows(r.suppliers);
      else setMsg(r.error ?? "Invalid Hub key");
    });
  }
  useEffect(() => {
    if (!unlocked) return;
    fetch(`/api/hub/suppliers?pool=demo`, { headers: hubHeaders() }).then((x) => x.json()).then((r) => {
      if (r.suppliers) setRows(r.suppliers);
    });
  }, [unlocked]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/hub/suppliers", { method: "POST", headers: { "Content-Type": "application/json", ...hubHeaders() },
      body: JSON.stringify({ ...f, quantity_kg: Number(f.quantity_kg), min_price: Number(f.min_price), quality_score: f.quality_score ? Number(f.quality_score) : null }) });
    setMsg(r.ok ? "Added" : (await r.json()).error);
    load();
  }
  async function importFull() {
    setMsg("Importing…");
    const r = await fetch("/api/hub/import", { method: "POST", headers: hubHeaders() });
    const d = await r.json();
    setMsg(r.ok ? `Imported ${d.imported} full-pool suppliers` : d.error);
    load();
  }
  async function resetDemo() {
    setMsg("Resetting demo seed…");
    for (const d of DEMO) await fetch("/api/hub/suppliers", { method: "POST", headers: { "Content-Type": "application/json", ...hubHeaders() }, body: JSON.stringify(d) });
    setMsg("Demo seed restored (3 suppliers)");
    setPool("demo"); load("demo");
  }

  return (
    <div className="min-h-screen bg-emerald-950 font-sans text-emerald-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
        <p className="rounded-xl border border-amber-500/60 p-3 text-sm text-amber-200">Internal ops — Hub key enforced server-side. Never shown to buyers (GR#1). Buyer flow never links here.</p>
        {!unlocked && (
          <div className="flex gap-2 rounded-2xl bg-emerald-900/60 p-4">
            <input type="password" placeholder="Hub key (HUB_KEY)" value={key} onChange={(e) => setKey(e.target.value)} className="flex-1 rounded-lg bg-emerald-950 px-3 py-2" />
            <button onClick={unlock} className="rounded-full bg-amber-400 px-5 py-2 font-bold text-emerald-950">Unlock Hub</button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Hub — Suppliers ({pool})</h1>
          <div className="flex gap-2">
            <button onClick={() => { setPool("demo"); load("demo"); }} className="rounded-full border border-emerald-600 px-4 py-2 text-sm">Demo pool</button>
            <button onClick={() => { setPool("full"); load("full"); }} className="rounded-full border border-emerald-600 px-4 py-2 text-sm">Full pool</button>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={importFull} className="rounded-full bg-amber-400 px-5 py-2 font-bold text-emerald-950">Load 100-row dataset</button>
          <button onClick={resetDemo} className="rounded-full border border-emerald-600 px-5 py-2">Reset Demo Seed</button>
        </div>
        {msg && <p className="text-amber-200">{msg}</p>}
        <table className="w-full text-sm">
          <thead><tr className="text-left text-emerald-300"><th>Name</th><th>Crop</th><th>Qty kg</th><th>Min</th><th>Location</th><th>Score</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-emerald-900"><td>{r.name}</td><td>{r.crop}</td><td>{Number(r.quantity_kg).toLocaleString()}</td><td>{r.min_price}</td><td>{r.location}</td><td>{r.quality_score}</td></tr>)}</tbody>
        </table>
        <div className="rounded-2xl bg-emerald-900/60 p-4">
          <h2 className="mb-2 font-bold">Supply workbench (virtualized, bounded pages)</h2>
          {unlocked ? <SupplyGrid pool={pool} /> : <p className="text-sm text-emerald-300">Unlock Hub to browse the large-pool workbench.</p>}
        </div>
        <form onSubmit={add} className="grid grid-cols-2 gap-2 rounded-2xl bg-emerald-900/60 p-4 sm:grid-cols-6">
          <input required placeholder="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="rounded-lg bg-emerald-950 px-2 py-2" />
          <input required placeholder="crop" value={f.crop} onChange={(e) => setF({ ...f, crop: e.target.value })} className="rounded-lg bg-emerald-950 px-2 py-2" />
          <input required placeholder="qty" type="number" value={f.quantity_kg} onChange={(e) => setF({ ...f, quantity_kg: e.target.value })} className="rounded-lg bg-emerald-950 px-2 py-2" />
          <input required placeholder="min" type="number" step="0.1" value={f.min_price} onChange={(e) => setF({ ...f, min_price: e.target.value })} className="rounded-lg bg-emerald-950 px-2 py-2" />
          <input placeholder="location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className="rounded-lg bg-emerald-950 px-2 py-2" />
          <button className="rounded-full bg-amber-400 font-bold text-emerald-950">Add</button>
        </form>
      </main>
    </div>
  );
}
