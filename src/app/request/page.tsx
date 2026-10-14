"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/ui";

export default function RequestForm() {
  const router = useRouter();
  const [form, setForm] = useState({ buyer_name: "", crop: "Mint", quantity_kg: "10000", delivery_days: "7", max_price: "9" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

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
      <p className="text-emerald-200">Our AI will source it for you. You deal with the platform — never with suppliers.</p>
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
