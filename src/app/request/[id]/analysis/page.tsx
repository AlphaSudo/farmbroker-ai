"use client";
import { useEffect, useState } from "react";
import { AgentLog, Card, Shell, Stepper } from "@/components/ui";

interface Analysis { confidence: number; available_kg: number; supplier_count: number; risk_level: string; reasons: string[]; quotable: boolean; }

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [a, setA] = useState<Analysis | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id }) })
      .then((r) => r.json()).then((d) => { setA(d.analysis ?? null); setLog(d.log ?? []); setBusy(false); });
  }, [id]);
  return (
    <Shell>
      <Stepper id={id} current="analysis" />
      <h1 className="text-3xl font-bold">AI Feasibility</h1>
      {busy && <p className="animate-pulse text-emerald-200">Supply Agent scanning… evaluating feasibility…</p>}
      {a && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card title="Supply Confidence" big>{a.confidence}%</Card>
            <Card title="Available" big>{a.available_kg.toLocaleString()}kg</Card>
            <Card title="Suppliers (network count)" big>{a.supplier_count}</Card>
            <Card title="Risk Level" big>{a.risk_level}</Card>
          </div>
          <ul className="list-disc space-y-1 pl-6 text-emerald-100">{a.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p className="text-sm text-emerald-300">Sourced from FarmBroker Supply Network — supplier identities stay with the platform (GR#1).</p>
          <AgentLog lines={log} />
          {a.quotable
            ? <a href={`/request/${id}/quote`} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Approve & Get Quote →</a>
            : <p className="text-red-300">Not quotable — insufficient supply. Try a smaller quantity.</p>}
        </>
      )}
    </Shell>
  );
}
