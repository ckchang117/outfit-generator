import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Client-side singleton Supabase client.
// Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Env not present; return null to allow app to fallback to local state.
    return null
  }
  if (!client) {
    client = createClient(url, key)
  }
  return client
}
