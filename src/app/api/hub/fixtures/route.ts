import { cookies } from "next/headers";
import { hubAuthorized } from "@/lib/auth/actor";
import { supabase } from "@/lib/supabase";
import { json, err, statusOf } from "@/lib/http";

// Creates a new isolated, unpaid scenario. Never changes shared stock or payment truth.
export async function POST(req: Request) {
  try {
    if (!hubAuthorized(req)) return err("Hub access required", 403);
    const { scenario } = await req.json() as { scenario?: string };
    if (!["happy-path", "recovery", "refund"].includes(scenario ?? "")) return err("Choose happy-path, recovery, or refund");
    const jar = await cookies();
    const previous = jar.get("fb_buyer")?.value;
    const owner = previous && /^[0-9a-f-]{36}$/i.test(previous) ? previous : crypto.randomUUID();
    const result = await supabase().rpc("create_demo_fixture", { p_scenario: scenario, p_owner: owner });
    if (result.error) throw result.error;
    jar.set("fb_buyer", owner, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 2592000 });
    return json({ request: { id: result.data }, scenario }, 201);
  } catch (e) { return err(e instanceof Error ? e.message : "Fixture creation failed", statusOf(e)); }
}
