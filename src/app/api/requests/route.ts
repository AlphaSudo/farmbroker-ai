import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { demandAgent } from "@/lib/agents/demand";
import { json, err } from "@/lib/http";

const Body = z.object({
  buyer_name: z.string().trim().min(1).max(80),
  crop: z.string().trim().min(1).max(40),
  quantity_kg: z.coerce.number().positive().int().max(1000000),
  delivery_days: z.coerce.number().int().min(1).max(30),
  max_price: z.coerce.number().positive().max(1000000),
});

export async function GET() {
  try {
    const { data, error } = await supabase().from("buyer_requests").select("*").order("id", { ascending: false }).limit(50);
    if (error) throw error;
    return json({ requests: data });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list requests", 500);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? "Invalid input");
    const structured = demandAgent(parsed.data); // throws on bad input
    const { data, error } = await supabase()
      .from("buyer_requests")
      .insert({ buyer_name: parsed.data.buyer_name, crop: structured.crop, quantity_kg: structured.quantity_kg, delivery_days: structured.delivery_days, max_price: parsed.data.max_price, status: "open" })
      .select("*")
      .single();
    if (error) throw error;
    return json({ request: data }, 201);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create request", 500);
  }
}
