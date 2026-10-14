"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/ui";

export default function RequestForm() {
  const router = useRouter();
  const [form, setForm] = useState({ buyer_name: "", crop: "Mint", quantity_kg: "10000", delivery_days: "7", max_price: "9" });
  const [brief, setBrief] = useState("");
  const [review, setReview] = useState<{ quantity_kg: number; delivery_days: number; max_price_per_kg: number | null; clarifications: string[]; crop: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setForm({ ...form, [k]: e.target.value }); setReview(null); };

  async function parse() {
    setError("");
    const r = await fetch("/api/intent/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) });
    const d = await r.json();
    if (!r.ok) { setError(d.error); return; }
    if (!d.intent || d.intent.quantity_kg <= 0) { setReview({ quantity_kg: 0, delivery_days: 0, max_price_per_kg: null, clarifications: d.clarifications, crop: "" }); return; }
    setReview(d.intent);
  }
  function apply() {
    if (!review || review.quantity_kg <= 0) return;
    setForm({ ...form, quantity_kg: String(review.quantity_kg), delivery_days: String(review.delivery_days), max_price: review.max_price_per_kg ? String(review.max_price_per_kg) : form.max_price, crop: review.crop || form.crop });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed"); setBusy(false); return; }
    router.push(`/request/${data.request.id}`);
  }

  return (
    <Shell>
      <h1 className="text-3xl font-bold">Describe what you need</h1>
      <p className="text-emerald-200">Write it in words or fill the form — then confirm the normalized summary before anything becomes an order.</p>
      <div className="grid gap-2 rounded-2xl bg-emerald-900/60 p-5">
        <label className="grid gap-1">In your words (optional)
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="10 tons of Mint within seven days, up to 9 EGP/kg" rows={2} className="rounded-lg bg-emerald-950 px-3 py-2" /></label>
        <button onClick={parse} className="w-fit rounded-full border border-amber-500/60 px-5 py-2 text-amber-300">Parse intent with AI</button>
        {review && review.quantity_kg > 0 && (
          <div className="rounded-xl border border-emerald-700 p-3 text-sm">
            <p>“{review.quantity_kg.toLocaleString()} kg = {(review.quantity_kg / 1000).toLocaleString()} metric tons” · {review.delivery_days} days · max {review.max_price_per_kg ?? "—"} EGP/kg · {review.crop}</p>
            {review.clarifications.length > 0 && <p className="text-amber-200">Notes: {review.clarifications.join("; ")}</p>}
            <button onClick={apply} className="mt-2 rounded-full bg-amber-400 px-4 py-1 font-bold text-emerald-950">Confirm into form</button>
          </div>
        )}
        {review && review.quantity_kg <= 0 && <p className="text-sm text-amber-200">Needs clarification: {review.clarifications.join("; ") || "ambiguous units"} — nothing was ordered.</p>}
      </div>
      <form onSubmit={submit} className="grid gap-4 rounded-2xl bg-emerald-900/60 p-6">
        <label className="grid gap-1">Buyer / company name
          <input required value={form.buyer_name} onChange={set("buyer_name")} placeholder="Cairo Foods" className="rounded-lg bg-emerald-950 px-3 py-2" /></label>
        <label className="grid gap-1">Crop
          <select value={form.crop} onChange={set("crop")} className="rounded-lg bg-emerald-950 px-3 py-2">
            <option>Mint</option><option>Basil</option><option>Lettuce</option>
          </select></label>
        <div className="grid grid-cols-3 gap-4">
          <label className="grid gap-1">Quantity (kg)
            <input required type="number" min={1} value={form.quantity_kg} onChange={set("quantity_kg")} className="rounded-lg bg-emerald-950 px-3 py-2" /></label>
          <label className="grid gap-1">Delivery (days)
            <input required type="number" min={1} max={30} value={form.delivery_days} onChange={set("delivery_days")} className="rounded-lg bg-emerald-950 px-3 py-2" /></label>
          <label className="grid gap-1">Max price (EGP/kg)
            <input required type="number" min={0.1} step={0.1} value={form.max_price} onChange={set("max_price")} className="rounded-lg bg-emerald-950 px-3 py-2" /></label>
        </div>
        {error && <p className="text-red-300">{error}</p>}
        <button disabled={busy} className="rounded-full bg-amber-400 px-6 py-3 font-bold text-emerald-950 disabled:opacity-50">
          {busy ? "Submitting…" : "Submit sourcing request"}</button>
      </form>
    </Shell>
  );
}
