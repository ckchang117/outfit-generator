"use client"

import PrimaryButton from "./primary-button"
import { getSupabaseBrowser } from "../lib/supabase/browser-client"

export default function LogoutButton() {
  const handleLogout = async () => {
    const sb = getSupabaseBrowser()
    // Fire-and-forget signouts; ensure server receives even on reload
    try {
      sb?.auth.signOut().catch(() => {})
    } catch {}
    try {
      fetch("/api/auth/signout", { method: "POST", keepalive: true }).catch(() => {})
    } catch {}
    // Force a hard navigation to the home page to reset all state but stay on main page
    if (typeof window !== "undefined") window.location.replace("/")
  }
  return (
    <PrimaryButton variant="ghost" onClick={handleLogout}>
      Sign out
    </PrimaryButton>
  )
}

