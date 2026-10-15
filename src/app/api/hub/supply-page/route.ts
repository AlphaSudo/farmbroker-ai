import { supabase } from "@/lib/supabase";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err, statusOf } from "@/lib/http";

// GET ?pool=&crop=&cursor=&limit=&sort= — cursor-keyset paginated Hub supply page.
// Bounded inputs, allowlisted sorts, stable (min_price, id) tiebreak, ≤100 rows.
const SORTS: Record<string, { col: string; asc: boolean }> = {
  price_asc: { col: "min_price", asc: true },
  price_desc: { col: "min_price", asc: false },
  qty_desc: { col: "quantity_kg", asc: false },
  score_desc: { col: "quality_score", asc: false },
};

export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const u = new URL(req.url);
    const pool = u.searchParams.get("pool") ?? "demo";
    const crop = u.searchParams.get("crop") ?? "";
    const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? 50)));
    const sort = SORTS[u.searchParams.get("sort") ?? "price_asc"] ?? SORTS.price_asc;
    const cursor = u.searchParams.get("cursor");
    let q = supabase().from("suppliers").select("id,name,crop,quantity_kg,min_price,location,quality_score,pool", { count: "exact" }).eq("pool", pool);
    if (crop) q = q.ilike("crop", crop);
    if (cursor) {
      const [lastPrice, lastId] = String(cursor).split("::");
      q = sort.asc ? q.or(`min_price.gt.${lastPrice},and(min_price.eq.${lastPrice},id.gt.${lastId})`) : q.or(`min_price.lt.${lastPrice},and(min_price.eq.${lastPrice},id.gt.${lastId})`);
    }
    q = q.order(sort.col, { ascending: sort.asc }).order("id", { ascending: true }).limit(limit + 1);
    const { data, error, count } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return json({
      rows: page, total: count ?? null,
      nextCursor: hasMore && last ? `${(last as { min_price: number }).min_price}::${last.id}` : null,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", statusOf(e));
  }
}
