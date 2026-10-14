"use client";
import { useEffect, useState } from "react";
import { Shell, Stepper } from "@/components/ui";

interface Msg { from: "buyer" | "agent"; text: string; source?: string; }

export default function NegotiatePage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "agent", text: "I'm FarmBroker AI. You negotiate with the platform — never with suppliers. Make me an offer (EGP/kg)." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState<number | null>(null);
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input.trim();
    setMsgs((m) => [...m, { from: "buyer", text }]);
    setInput(""); setBusy(true);
    const r = await fetch("/api/negotiate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, message: text }) });
    const d = await r.json();
    setBusy(false);
    setMsgs((m) => [...m, { from: "agent", text: d.reply ?? d.error ?? "Failed", source: d.source }]);
    if (d.agreed) setAgreed(d.agreed);
  }

  return (
    <Shell>
      <Stepper id={id} current="request" />
      <h1 className="text-3xl font-bold">Negotiation Console</h1>
      <p className="rounded-xl border border-emerald-800 p-3 text-sm text-emerald-200">You negotiate with FarmBroker AI — never with suppliers (GR#1/GR#2). Floor guard enforced server-side.</p>
      <div className="flex flex-col gap-3 rounded-2xl bg-emerald-900/60 p-5">
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.from === "buyer" ? "self-end bg-amber-400 text-emerald-950" : "self-start bg-emerald-950 text-emerald-100"}`}>
            {m.text}
            {m.source && <span className="ml-2 rounded-full border border-emerald-700 px-2 text-[10px] text-emerald-400">{m.source.startsWith("ai:") ? "AI" : "rules"}</span>}
          </div>
        ))}
        {busy && <p className="animate-pulse text-sm text-emerald-300">Agent thinking…</p>}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Can you do 7.5?" className="flex-1 rounded-full bg-emerald-900/60 px-4 py-3" />
        <button disabled={busy} className="rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">Send</button>
      </form>
      {agreed !== null && <a href={`/request/${id}/quote`} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Accept {agreed} EGP/kg → Quote</a>}
    </Shell>
  );
}
