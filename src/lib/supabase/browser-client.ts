"use client"

import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient, Session } from "@supabase/supabase-js"

type GlobalWithSupabase = typeof globalThis & { 
  __sbClient?: SupabaseClient
  __sbSession?: Session | null
  __sbSessionPromise?: Promise<Session | null>
}

let sessionInitialized = false

export function getSupabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  
  const g = globalThis as GlobalWithSupabase
  if (g.__sbClient) return g.__sbClient

  g.__sbClient = createClient(url, key, {
    auth: {
      // Enable persistence so tokens are always attached and refreshed
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Ensure session is stored and retrieved properly
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  })

  // Set up persistent session tracking
  if (!sessionInitialized) {
    sessionInitialized = true
    
    // Initialize session state
    g.__sbClient.auth.getSession().then(({ data: { session } }) => {
      g.__sbSession = session
    }).catch(() => {
      g.__sbSession = null
    })

    // Track session changes and keep global state in sync
    g.__sbClient.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] Global session state change:', event, { 
        hasSession: Boolean(session),
        hasToken: Boolean(session?.access_token),
        userId: session?.user?.id 
      })
      g.__sbSession = session
      
      // Clear any stale session promises on auth state changes
      g.__sbSessionPromise = undefined
    })
  }

  return g.__sbClient
}

/**
 * Gets the current session from the global cache, with fallback to fresh fetch
 */
export async function getCurrentSession(): Promise<Session | null> {
  const client = getSupabaseBrowser()
  if (!client) return null

  const g = globalThis as GlobalWithSupabase
  
  // If we have a cached session with valid token, use it
  if (g.__sbSession?.access_token) {
    return g.__sbSession
  }

  // If there's already a session promise in flight, wait for it
  if (g.__sbSessionPromise) {
    return g.__sbSessionPromise
  }

  // Create new session promise and cache it
  g.__sbSessionPromise = client.auth.getSession().then(({ data: { session } }) => {
    g.__sbSession = session
    g.__sbSessionPromise = undefined
    return session
  }).catch(() => {
    g.__sbSession = null
    g.__sbSessionPromise = undefined
    return null
  })

  return g.__sbSessionPromise
}

