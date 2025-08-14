import type { SupabaseClient, Session } from "@supabase/supabase-js"
import { getCurrentSession } from "./browser-client"

/**
 * Ensures we have a valid session using the persistent session cache.
 * This prevents intermittent 401s by using cached session state.
 */
export async function ensureAuthReady(client: SupabaseClient): Promise<Session | null> {
  console.log("[Auth] ensureAuthReady: using persistent session cache")
  
  try {
    // Use the persistent session cache first
    const session = await getCurrentSession()
    
    console.log("[Auth] ensureAuthReady: persistent session result", {
      hasSession: Boolean(session),
      hasToken: Boolean(session?.access_token),
      userId: session?.user?.id,
    })
    
    if (session?.access_token) {
      return session
    }
    
    // If no cached session, try a fresh fetch with timeout
    console.log("[Auth] ensureAuthReady: no cached session, trying fresh fetch")
    const timeout = new Promise<{ data: { session: Session | null } }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null } }), 2000)
    )
    
    const res = (await Promise.race([client.auth.getSession(), timeout])) as {
      data: { session: Session | null }
    }
    
    console.log("[Auth] ensureAuthReady: fresh fetch result", {
      hasSession: Boolean(res?.data?.session),
      hasToken: Boolean(res?.data?.session?.access_token),
      userId: res?.data?.session?.user?.id,
    })
    
    return res?.data?.session || null
    
  } catch (e) {
    console.log("[Auth] ensureAuthReady: error", e)
    return null
  }
}

