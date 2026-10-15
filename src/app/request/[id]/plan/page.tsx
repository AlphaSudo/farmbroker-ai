"use client";
import { useEffect, useState } from "react";
import { Shell, Stepper } from "@/components/ui";

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [runId, setRunId] = useState("");
  const [decision, setDecision] = useState<{ id: string; hash: string } | null>(null);
  const [data, setData] = useState<{ run?: { status: string; snapshot?: { selection?: { candidate_id: string; justification: string } } }; steps?: Array<{ kind: string; output: object; model: string | null; validation: string | null }> } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);
  async function refresh(rid: string) {
    const r = await fetch(`/api/runs/${rid}`).then((x) => x.json());
    setData(r.run ? r : null);
    if (r.error) setMsg(r.error);
  }
  async function create() {
    setMsg("Opening run…");
    const r = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id }) });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error); return; }
    setRunId(d.runId); refresh(d.runId); setMsg("");
  }
  async function advance() {
    setBusy(true);
    const r = await fetch(`/api/runs/${runId}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const d = await r.json();
    setBusy(false);
    setMsg(d.replayed ? "Replayed stored step (no duplicate work)." : r.ok ? "Decision recorded." : d.error);
    if (d.decisionId) setDecision({ id: d.decisionId, hash: d.planHash });
    refresh(runId);
  }
  const sel = data?.run?.snapshot?.selection as { candidate_id: string; justification: string } | undefined;
  return (
    <Shell>
      <Stepper id={id} current="request" />
      <h1 className="text-3xl font-bold">AI Plan Selection</h1>
      <p className="text-sm text-emerald-300">The model picks one server-validated plan ID. Arithmetic, stock, and budget stay in code — never in the model.</p>
      {!runId && <button onClick={create} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Evaluate plans with AI</button>}
      {runId && (
        <button onClick={advance} disabled={busy} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">
          {busy ? "Selecting…" : "Advance one step"}</button>
      )}
      {msg && <p className="text-amber-200">{msg}</p>}
      {sel && (
        <div className="rounded-2xl bg-emerald-900/60 p-5">
          <p>Selected: <b className="text-amber-300">{sel.candidate_id}</b></p>
          <p className="mt-1 text-emerald-100">{sel.justification}</p>
        </div>
      )}
      {decision && (
        <div className="rounded-2xl border border-amber-500/60 p-5">
          <p className="text-sm text-emerald-300">Bound decision record</p>
          <p className="font-mono text-xs text-amber-200">decision {decision.id.slice(0, 13)}… · plan hash {decision.hash.slice(0, 16)}…</p>
          <p className="mt-1 text-sm text-emerald-100">Procurement executes these exact stored items — the hash on the receipt must match. Pass this decision ID at checkout execution.</p>
        </div>
      )}
      {(data?.steps ?? []).map((s, i) => (
        <div key={i} className="rounded-2xl border border-emerald-800 p-4 text-sm">
          <p className="font-bold text-emerald-100">{s.kind} · {s.model ? `Live AI (${s.model})` : "Manual/rules-assisted"} · {s.validation}</p>
          <pre className="mt-2 overflow-auto font-mono text-xs text-emerald-300">{JSON.stringify(s.output, null, 1).slice(0, 1200)}</pre>
        </div>
      ))}
    </Shell>
  );
}
