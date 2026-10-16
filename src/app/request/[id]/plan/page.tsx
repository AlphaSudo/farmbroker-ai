"use client";
import { useCallback, useEffect, useState } from "react";
import { Shell, Stepper } from "@/components/ui";

export default function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [runId, setRunId] = useState("");
  const [decision, setDecision] = useState<{ id: string; hash: string } | null>(null);
  const [data, setData] = useState<{ run?: { status: string; snapshot?: { selection?: { candidate_id: string; justification: string }; result?: { decisionId?: string; planHash?: string } } }; steps?: Array<{ kind: string; output?: object; model: string | null; validation: string | null }> } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { params.then((x) => setId(x.id)); }, [params]);
  const refresh = useCallback(async (rid: string) => {
    const r = await fetch(`/api/runs/${rid}`).then((x) => x.json());
    setData(r.run ? r : null);
    if (r.error) setMsg(r.error);
    const result = r.run?.snapshot?.result;
    if (result?.decisionId && result?.planHash) setDecision({ id: result.decisionId, hash: result.planHash });
    return r.run?.status as string | undefined;
  }, []);
  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/api/runs?requestId=${id}`).then(r => r.json()).then(r => { if (active && r.runId) setRunId(r.runId); }).catch(() => { if (active) setMsg("Could not restore the planning run; retry."); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    if (!runId) return;
    const poll = () => { void refresh(runId).then(status => { if (!status || ["decided", "failed"].includes(status)) clearInterval(timer); }).catch(() => setMsg("Connection interrupted; the saved run continues in the background.")); };
    const timer = setInterval(poll, 2500);
    poll();
    return () => clearInterval(timer);
  }, [runId, refresh]);
  async function create() {
    setMsg("Opening run…");
    const r = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id }) });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error); return; }
    setData(null); setDecision(null); setRunId(d.runId); refresh(d.runId); setMsg("");
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
      <Stepper id={id} current="plan" />
      <h1 className="text-3xl font-bold">AI Plan Selection</h1>
      <p className="text-sm text-emerald-300">The model picks one server-validated plan ID. Arithmetic, stock, and budget stay in code — never in the model.</p>
      {data?.run?.status === "failed" && <p className="text-amber-200">Planning stopped after repeated service failures. Retry planning to start a fresh attempt.</p>}
      {(!runId || data?.run?.status === "failed") && <button onClick={create} disabled={!id} className="w-fit rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">{runId ? "Retry planning" : "Evaluate plans with AI"}</button>}
      {runId && data?.run?.status !== "failed" && (
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
          <p className="mt-1 text-sm text-emerald-100">Your accepted quote binds this decision. Procurement loads its stored items and verifies the plan hash.</p>
          <a href={`/request/${id}/quote`} className="mt-3 inline-block rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950">Review bound quote →</a>
        </div>
      )}
      {(data?.steps ?? []).map((s, i) => (
        <div key={i} className="rounded-2xl border border-emerald-800 p-4 text-sm">
          <p className="font-bold text-emerald-100">{s.kind} · {s.model ? `Live AI (${s.model})` : "Manual/rules-assisted"} · {s.validation}</p>
          {s.output !== undefined && <pre className="mt-2 overflow-auto font-mono text-xs text-emerald-300">{JSON.stringify(s.output, null, 1).slice(0, 1200)}</pre>}
        </div>
      ))}
    </Shell>
  );
}
