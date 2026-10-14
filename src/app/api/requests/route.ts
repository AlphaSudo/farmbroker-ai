import { z } from "zod";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { demandAgent } from "@/lib/agents/demand";
import { hubAuthorized } from "@/lib/auth/actor";
import { json, err } from "@/lib/http";

const Body = z.object({
  buyer_name: z.string().trim().min(1).max(80),
  crop: z.string().trim().min(1).max(40),
  quantity_kg: z.coerce.number().positive().int().max(1000000),
  delivery_days: z.coerce.number().int().min(1).max(30),
  max_price: z.coerce.number().positive().max(1000000),
  pool: z.enum(["demo", "full"]).optional(),
  scenario: z.string().trim().max(40).optional(),
});

// Buyer creates its own request (pool/scenario persisted; query params can never switch them later).
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input");
    const structured = demandAgent(parsed.data);
    const jar = await cookies();
    const previous = jar.get("fb_buyer")?.value;
    const ownerToken = previous && /^[0-9a-f-]{36}$/i.test(previous) ? previous : crypto.randomUUID();
    const { data, error } = await supabase()
      .from("buyer_requests")
      .insert({
        buyer_name: parsed.data.buyer_name, crop: structured.crop, quantity_kg: structured.quantity_kg,
        delivery_days: structured.delivery_days, max_price: parsed.data.max_price, status: "open",
        pool: parsed.data.pool ?? "demo", scenario: parsed.data.scenario ?? "happy-path",
        owner_token: ownerToken,
      })
      .select("id,owner_token")
      .single();
    if (error) throw error;
    jar.set("fb_buyer", ownerToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return json({ request: { id: data.id } }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create request", 500);
  }
}

// Ops list only (buyer has no cross-order view).
export async function GET(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const { data, error } = await supabase().from("buyer_requests").select("id,buyer_name,crop,quantity_kg,status,pool,scenario,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return json({ requests: data });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed", 500);
  }
}
