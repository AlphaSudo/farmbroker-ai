// Server-only Supabase client (service/secret key). NEVER import in client components.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
