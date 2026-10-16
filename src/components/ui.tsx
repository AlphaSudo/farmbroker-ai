"use client";
import { useState } from "react";

export function AgentLog({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  return (
    <div className="rounded-xl border border-emerald-800 text-sm">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-2 text-left text-emerald-300">
        {open ? "▼" : "▶"} Agent log ({lines.length})
      </button>
      {open && (
        <ul className="space-y-1 border-t border-emerald-800 px-4 py-3 font-mono text-xs text-emerald-200">
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}

export function Stepper({ id, current }: { id: string; current: string }) {
  const steps: Array<[string, string]> = [
    ["request", "Request"], ["analysis", "Analysis"], ["plan", "AI plan"], ["quote", "Quote"],
    ["pay", "Pay"], ["procure", "Procure"], ["quality", "Quality"], ["settlement", "Settlement"],
  ];
  return (
    <nav className="flex flex-wrap gap-2 text-sm">
      {steps.map(([slug, label]) => (
        <a key={slug} href={slug === "request" ? `/request/${id}` : `/request/${id}/${slug}`}
          className={`rounded-full px-3 py-1 ${slug === current ? "bg-amber-400 font-bold text-emerald-950" : "border border-emerald-700 text-emerald-200"}`}>
          {label}
        </a>
      ))}
      <a href={`/request/${id}/negotiate`} className="rounded-full border border-dashed border-emerald-700 px-3 py-1 text-emerald-300">Negotiate</a>
      <a href={`/request/${id}/export`} className="rounded-full border border-dashed border-emerald-700 px-3 py-1 text-emerald-300">Export</a>
    </nav>
  );
}

export function Card({ title, children, big }: { title: string; children: React.ReactNode; big?: boolean }) {
  return (
    <div className="rounded-2xl bg-emerald-900/60 p-5">
      <h3 className="text-sm font-semibold text-emerald-300">{title}</h3>
      <div className={big ? "mt-1 text-3xl font-bold text-amber-300" : "mt-1 text-emerald-100"}>{children}</div>
    </div>
  );
}

export const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-emerald-950 font-sans text-emerald-50">
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">{children}</main>
  </div>
);
