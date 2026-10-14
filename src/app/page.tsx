import Link from "next/link";

const FLOW = [
  "Request",
  "AI Quote",
  "PayPal Pay",
  "Procurement (only after payment)",
  "Hub Inspection",
  "Settlement",
];

const PROTOTYPE = [
  "Procurement Request",
  "AI Quote",
  "PayPal Payment",
  "Procurement Progress",
  "Settlement",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-emerald-950 font-sans text-emerald-50">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
        {/* Hero */}
        <section className="flex flex-col items-start gap-5">
          <p className="rounded-full border border-emerald-700 px-3 py-1 text-xs tracking-wide text-emerald-300">
            FarmBroker AI — autonomous procurement platform
          </p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            Describe what you need. Our AI will source it for you.
          </h1>
          <p className="max-w-2xl text-lg text-emerald-200">
            We sell Guaranteed Supply — you ask for 10 Tons Mint, the platform
            handles everything: feasibility, pricing, PayPal payment,
            multi-supplier procurement, Hub inspection, and settlement.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/request"
              className="rounded-full bg-amber-400 px-6 py-3 font-semibold text-emerald-950 transition hover:bg-amber-300"
            >
              Create Buyer Request
            </Link>
            <Link
              href="/request"
              className="rounded-full border border-emerald-600 px-6 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-900"
            >
              View Demo Data
            </Link>
          </div>
        </section>

        {/* Narratives (verbatim, P9) */}
        <section className="rounded-2xl border border-emerald-800 bg-emerald-900/60 p-6">
          <blockquote className="text-lg font-medium text-amber-200">
            “The buyer requested supply. The AI sourced it. The platform
            guaranteed it. PayPal secured the transaction.”
          </blockquote>
          <p className="mt-3 text-emerald-200">
            FarmBroker AI transforms fragmented agricultural supply into
            guaranteed fulfillment. Buyers purchase outcomes. AI handles
            sourcing, quality, supplier coordination, and financial settlement.
            PayPal secures the transaction.
          </p>
        </section>

        {/* Problem (faceless illustration — NOT listings, GR#1) */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-emerald-900/60 p-6">
            <h2 className="font-semibold text-emerald-100">Smallholders, alone</h2>
            <ul className="mt-3 space-y-2 text-emerald-200">
              <li>Smallholder A — 200kg — too small alone</li>
              <li>Smallholder B — 300kg — too small alone</li>
              <li>Smallholder C — 500kg — too small alone</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-emerald-900/60 p-6">
            <h2 className="font-semibold text-emerald-100">Bulk buyer need</h2>
            <p className="mt-3 text-3xl font-bold text-amber-300">10,000 kg</p>
            <p className="mt-2 text-emerald-200">
              No single supplier can fulfill this order. 100 smallholders → 1
              mega-supplier via AI procurement.
            </p>
          </div>
        </section>

        {/* Flow strip (P1 order) */}
        <section className="rounded-2xl border border-emerald-800 p-6">
          <h2 className="font-semibold">How it works</h2>
          <ol className="mt-4 flex flex-col gap-2">
            {FLOW.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-emerald-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-800 text-sm font-bold text-amber-300">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-emerald-300">
            Procurement starts ONLY after PayPal payment. Suppliers deliver to
            the FarmBroker Collection Hub — never to the buyer.
          </p>
        </section>

        {/* Live demo map */}
        <section className="rounded-2xl bg-emerald-900/60 p-6">
          <h2 className="font-semibold">Live in this sandbox demo</h2>
          <ul className="mt-3 space-y-2">
            {PROTOTYPE.map((s) => (
              <li key={s} className="flex items-center gap-3 text-emerald-200">
                <span className="rounded-full border border-amber-500/60 px-2 py-0.5 text-xs text-amber-300">
                  live
                </span>
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-emerald-300">
            Buyer dashboard: Order Status · Confidence · Expected Delivery ·
            Payment Status. Demo lots (2–5 tons) are illustrative aggregations,
            not measured farm sizes. Supplier payouts simulated; PayPal Sandbox
            only — no real money.
          </p>
        </section>

        <footer className="border-t border-emerald-800 pt-6 text-sm text-emerald-400">
          <p>
            FarmBroker AI is an autonomous procurement platform. A buyer
            submits a sourcing request. AI evaluates feasibility, prices the
            deal, collects payment, procures supply from multiple suppliers,
            manages quality control, settles suppliers, and delivers a
            completed supply chain transaction.
          </p>
          <p className="mt-2">
            Sandbox demo — no real money. AI via free-tier API with
            deterministic fallback.
          </p>
        </footer>
      </main>
    </div>
  );
}
