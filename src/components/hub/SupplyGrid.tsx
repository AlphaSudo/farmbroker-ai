"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, themeQuartz, type ColDef } from "ag-grid-community";
import { hubHeaders } from "@/lib/auth/hub-client";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Row { id: string; name: string; crop: string; quantity_kg: number; min_price: number; location: string | null; quality_score: number | null; pool: string; }

// Virtualized Hub supply workbench (2.7): bounded cursor pages, stable IDs, no whole-pool fetch.
export default function SupplyGrid({ pool }: { pool: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [crop, setCrop] = useState("");
  const [msg, setMsg] = useState("");
  const cache = useRef<Row[]>([]);

  const load = useCallback(async (reset: boolean, cur: string | null) => {
    const u = new URLSearchParams({ pool, limit: "100", sort: "price_asc" });
    if (crop) u.set("crop", crop);
    if (cur) u.set("cursor", cur);
    const r = await fetch(`/api/hub/supply-page?${u}`, { headers: hubHeaders() }).then((x) => x.json());
    if (r.error) { setMsg(r.error); return; }
    cache.current = reset ? r.rows : [...cache.current, ...r.rows];
    setRows(cache.current);
    setCursor(r.nextCursor);
    setTotal(r.total);
  }, [pool, crop]);

  useEffect(() => {
    const u = new URLSearchParams({ pool, limit: "100", sort: "price_asc" });
    if (crop) u.set("crop", crop);
    fetch(`/api/hub/supply-page?${u}`, { headers: hubHeaders() }).then((x) => x.json()).then((r) => {
      if (r.error) { setMsg(r.error); return; }
      cache.current = r.rows; setRows(r.rows); setCursor(r.nextCursor); setTotal(r.total);
    });
  }, [pool, crop]);

  const cols: ColDef<Row>[] = [
    { field: "name", headerName: "Lot", width: 130 },
    { field: "crop", width: 100 },
    { field: "quantity_kg", headerName: "Kg", width: 110, valueFormatter: (p) => Number(p.value).toLocaleString() },
    { field: "min_price", headerName: "Min/kg", width: 100 },
    { field: "location", width: 120 },
    { field: "quality_score", headerName: "Score", width: 90 },
  ];

  return (
    <div>
      <div className="mb-2 flex gap-2 text-sm">
        <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="filter crop" className="rounded-lg bg-emerald-950 px-3 py-1" />
        <button onClick={() => load(true, null)} className="rounded-full border border-emerald-600 px-4 py-1">Apply</button>
        <span className="self-center text-emerald-300">{rows.length}{total !== null ? ` / ${total}` : ""} rows (bounded pages)</span>
      </div>
      {msg && <p className="text-amber-200">{msg}</p>}
      <div style={{ height: 420, width: "100%" }}>
        <AgGridReact theme={themeQuartz} rowData={rows} columnDefs={cols} getRowId={(p) => p.data.id}
          rowSelection="single" onSelectionChanged={(e) => {
            const s = e.api.getSelectedRows()[0] as Row | undefined;
            if (s) setMsg(`Selected ${s.name} — ${Number(s.quantity_kg).toLocaleString()}kg @ ${s.min_price}/kg (detail stays in Hub finance/inspection views)`);
          }} />
      </div>
      {cursor && <button onClick={() => load(false, cursor)} className="mt-2 rounded-full border border-emerald-600 px-4 py-1 text-sm">Load next 100 (cursor)</button>}
    </div>
  );
}
