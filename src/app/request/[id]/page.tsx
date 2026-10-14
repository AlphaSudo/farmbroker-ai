"use client";
import { useEffect, useState } from "react";
import { AgentLog, Card, Shell, Stepper } from "@/components/ui";

export default function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<{ request?: Record<string, number | string | null> & { analysis?: { confidence: number } | null }; deal?: { status: string } | null } | null>(null);
  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/requests/${id}`).then((r) => r.json()).then(setData);
  }, [id]);
  if (!data?.request) return <Shell><p>Loading…</p></Shell>;
  const r = data.request;
  const a = (r.analysis ?? null) as { confidence: number } | null;
  return (
    <Shell>
      <Stepper id={id} current="request" />
      <h1 className="text-3xl font-bold">{String(r.crop)} — {Number(r.quantity_kg).toLocaleString()}kg</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card title="Order Status">{String(r.status)}</Card>
        <Card title="Confidence Score">{a ? `${a.confidence}%` : "— run analysis"}</Card>
        <Card title="Expected Delivery">{`${r.delivery_days} days`}</Card>
        <Card title="Payment Status">{data.deal ? data.deal.status : "Unpaid"}</Card>
      </div>
      <AgentLog lines={[`Buyer ${r.buyer_name} requests ${r.quantity_kg}kg ${r.crop}. Platform handles everything.`]} />
      <div className="flex gap-3">
        <a href={`/request/${id}/analysis`} className="rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Run AI Analysis →</a>
      </div>
    </Shell>
  );
}
