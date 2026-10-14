"use client";
import { useEffect, useState } from "react";
import { AgentLog, Shell, Stepper } from "@/components/ui";

interface Row { id: string; allocated_kg: number; inspection_status: string; quality_grade: string | null; name: string; }

export default function QualityPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [dealId, setDealId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [buyerView, setBuyerView] = useState(false);
  const [msg, setMsg] = useState("");
  const [forms, setForms] = useState<Record<string, { w: string; m: string; s: string; c: string }>>({});

  async function load(did: string) {
    const r = await fetch(`/api/quality?dealId=${did}`).then((x) => x.json());
    setRows(r.allocations ?? []);
  }
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/requests/${id}`).then((r) => r.json()).then((d) => { if (d.deal) { setDealId(d.deal.id); load(d.deal.id); } });
  }, [id]);

  async function approveAll() {
    setMsg("Grading…");
    const r = await fetch("/api/quality/approve-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId }) });
    const d = await r.json();
    setMsg(r.ok ? `Accepted ${d.accepted} · Partial ${d.partial} · Rejected ${d.rejected}` : d.error);
    load(dealId);
  }

  async function gradeOne(aid: string) {
    const f = forms[aid] ?? { w: "", m: "", s: "", c: "Good" };
    const r = await fetch("/api/quality", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocationId: aid, weight_received_kg: f.w, moisture_pct: f.m, visual_score: f.s, condition: f.c }) });
    const d = await r.json();
    setMsg(r.ok ? `${d.decision}${d.grade ? ` · Grade ${d.grade}` : ""}` : d.error);
    load(dealId);
  }

  const set = (aid: string, k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const prev = forms[aid] ?? { w: "", m: "", s: "", c: "Good" };
    setForms({ ...forms, [aid]: { ...prev, [k]: e.target.value } });
  };
  const counts = {
    accepted: rows.filter((r) => r.inspection_status === "passed").length,
    partial: rows.filter((r) => r.inspection_status === "partial").length,
    rejected: rows.filter((r) => r.inspection_status === "failed").length,
  };
  const ready = rows.length > 0 && rows.every((r) => r.inspection_status !== "pending");

  return (
    <Shell>
      <Stepper id={id} current="quality" />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Quality Gate — Collection Hub</h1>
        <button onClick={() => setBuyerView(!buyerView)} className="rounded-full border border-emerald-600 px-4 py-2 text-sm">
          {buyerView ? "Hub view" : "Buyer view (?view=buyer)"}</button>
      </div>
      <p className="text-sm text-emerald-300">Delivered to FarmBroker Collection Hub (never to buyer). Inspection: Quantity · Quality · Condition · Moisture.</p>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-emerald-900/60 p-4">Accepted: <b className="text-amber-300">{counts.accepted}</b></div>
        <div className="rounded-2xl bg-emerald-900/60 p-4">Partial: <b className="text-amber-300">{counts.partial}</b></div>
        <div className="rounded-2xl bg-emerald-900/60 p-4">Rejected: <b className="text-amber-300">{counts.rejected}</b></div>
      </div>
      <div className="rounded-2xl border border-emerald-800 p-4 text-sm">
        Risk = Supplier (before inspection) → Hub check → Risk = Platform (after). Accepted cargo: Inventory Protected · Platform Risk Active · Platform Responsibility for post-acceptance damage (simulated in MVP).
      </div>
      <button onClick={approveAll} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Approve All with Demo Values</button>
      <div className="grid gap-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-emerald-900/60 p-5">
            <div className="flex items-center justify-between">
              <b>{buyerView ? "FarmBroker Supply Network share" : r.name} — {r.allocated_kg.toLocaleString()}kg</b>
              <span className="rounded-full border border-emerald-700 px-3 py-1 text-xs">{r.inspection_status}{r.quality_grade ? ` · Grade ${r.quality_grade}` : ""}</span>
            </div>
            {!buyerView && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input placeholder="weight kg" value={forms[r.id]?.w ?? ""} onChange={set(r.id, "w")} className="rounded-lg bg-emerald-950 px-2 py-2" />
                <input placeholder="moisture %" value={forms[r.id]?.m ?? ""} onChange={set(r.id, "m")} className="rounded-lg bg-emerald-950 px-2 py-2" />
                <input placeholder="score 1-5" value={forms[r.id]?.s ?? ""} onChange={set(r.id, "s")} className="rounded-lg bg-emerald-950 px-2 py-2" />
                <select value={forms[r.id]?.c ?? "Good"} onChange={set(r.id, "c")} className="rounded-lg bg-emerald-950 px-2 py-2">
                  <option>Good</option><option>Fair</option><option>Wet</option><option>Damaged</option>
                </select>
                <button onClick={() => gradeOne(r.id)} className="rounded-full border border-amber-500/60 px-3 py-2 text-amber-300">Grade</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {msg && <p className="text-amber-200">{msg}</p>}
      <AgentLog lines={["Quality Agent: 4-field inspection per allocation.", "Quality Agent: ownership transfers to platform on pass."]} />
      {ready && <a href={`/request/${id}/settlement`} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Go to Settlement →</a>}
    </Shell>
  );
}
