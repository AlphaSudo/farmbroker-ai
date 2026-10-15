"use client";
import { useEffect, useState } from "react";
import { AgentLog, Card, Shell, Stepper } from "@/components/ui";

const STATUS_LABELS: Record<string, string> = {
  open: "Draft request", quoted: "Quote accepted — Awaiting PayPal payment", paid: "Paid — procuring supply",
  procuring: "Procuring — inspecting supply", covered: "Covered — inspecting supply", short: "Short — needs recovery or refund",
  settled: "Settled — awaiting Hub handover", completed: "Fulfilled",
};

export default function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [data, setData] = useState<{ request?: Record<string, number | string | null> & { analysis?: { confidence: number } | null; status: string }; deal?: { id: string; status: string; outcome: string } | null } | null>(null);
  const [events, setEvents] = useState<Array<{ label: string; created_at: string }>>([]);
  const [version, setVersion] = useState<string | number>(0);
  useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
  useEffect(() => {
    if (!id) return;
    let stop = false;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await fetch(`/api/requests/${id}/summary`).then((x) => x.json()).catch(() => null);
      if (stop || !r?.request) return;
      setData({ request: r.request, deal: r.deal });
      setEvents(r.events ?? []);
      setVersion(r.version ?? 0);
      const live = r.deal && r.deal.outcome !== "fulfilled" && r.deal.outcome !== "refunded";
      if (live && !document.hidden) {
        delay = Math.min(30000, delay * 1.5); // backoff while pending; stops at terminal outcomes
        timer = setTimeout(tick, delay);
      }
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);
  if (!data?.request) return <Shell><p>Loading…</p></Shell>;
  const r = data.request;
  const a = (r.analysis ?? null) as { confidence: number } | null;
  const deal = data.deal ?? null;
  const status = deal?.outcome === "fulfilled" ? "completed" : deal?.outcome === "refunded" ? "refunded" : deal ? deal.status : String(r.status);
  const next: Array<[string, string]> =
    !deal ? [[`/request/${id}/analysis`, a ? "Continue to quote →" : "Run AI Analysis →"]]
    : deal.status === "quoted" ? [[`/request/${id}/pay`, "Pay with PayPal →"]]
    : status === "completed" ? [[`/request/${id}/settlement`, "View receipt →"]]
    : status === "refunded" ? []
    : deal.status === "short" ? [[`/request/${id}/procure`, "Review recovery →"]]
    : [[`/request/${id}/procure`, "Track procurement →"]];
  return (
    <Shell>
      <Stepper id={id} current="request" />
      <h1 className="text-3xl font-bold">{String(r.crop)} — {Number(r.quantity_kg).toLocaleString()}kg</h1>
      <p className="w-fit rounded-full bg-emerald-900 px-4 py-1 font-semibold text-amber-300">{STATUS_LABELS[status] ?? status}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card title="Order Status">{STATUS_LABELS[status] ?? status}</Card>
        <Card title="Feasibility score">{a ? `${a.confidence}/100` : "- run analysis"}</Card>
        <Card title="Expected Delivery">{`${r.delivery_days} days`}</Card>
        <Card title="Payment Status">{deal ? deal.status : "Unpaid"}</Card>
      </div>
      {next.map(([href, label]) => (
        <a key={href} href={href} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">{label}</a>
      ))}
      {events.length > 0 && (
        <div className="rounded-2xl border border-emerald-800 p-4">
          <h3 className="font-bold">Order timeline (recorded events) · v{version}</h3>
          <ul className="mt-2 space-y-1 text-sm text-emerald-100">
            {events.map((e, i) => <li key={i}>{e.label} · {String(e.created_at).slice(0, 19).replace("T", " ")}</li>)}
          </ul>
        </div>
      )}
      <AgentLog lines={[`Buyer order ${status}. Next: ${next[0]?.[1] ?? "done"}.`]} />
    </Shell>
  );
}
