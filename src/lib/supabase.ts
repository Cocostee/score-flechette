import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/* Returns the shared browser Supabase client, or null when unconfigured. */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return cached;
}
