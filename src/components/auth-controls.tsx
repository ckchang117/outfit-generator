"use client"

import { useEffect, useState } from "react"
import LoginButton from "./login-button"
import LogoutButton from "./logout-button"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"
import { ensureAuthReady } from "../lib/supabase/ensure-auth"

export default function AuthControls() {
  const [label, setLabel] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sb = getSupabaseBrowser()
    if (!sb) {
      setReady(true)
      return
    }
    // no custom event needed since we hard reload on signout now
    ;(async () => {
      // Wait for session hydration to avoid flicker when already signed in
      await ensureAuthReady(sb)
      const { data: sess } = await sb.auth.getSession()
      console.log("[AuthControls] getSession:", {
        hasSession: Boolean(sess.session),
        userId: sess.session?.user?.id,
      })
      if (!sess.session) {
        setLabel(null)
        setReady(true)
        return
      }
      const u0 = sess.session.user
      setLabel(u0?.email ?? null)
      // Also validate via getUser (network) but don't block UI
      sb.auth.getUser().then(({ data, error }) => {
        const u = data.user
        console.log("[AuthControls] getUser:", { userId: u?.id, email: u?.email, error })
        if (u?.email) setLabel(u.email)
      })
      setReady(true)
    })()
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      console.log("[AuthControls] onAuthStateChange:", { event, userId: session?.user?.id })
      const u = session?.user
      setLabel(u?.email ?? null)
    })
    return () => {
      sub?.subscription.unsubscribe()
      // nothing to clean up for manual signout event
    }
  }, [])

  if (!ready) {
    return <LoginButton />
  }

  return label ? (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm text-neutral-700 truncate max-w-[160px]" title={label}>
        {label}
      </span>
      <LogoutButton />
    </div>
  ) : (
    <LoginButton />
  )
}

