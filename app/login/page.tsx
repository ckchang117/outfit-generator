"use client"

import { useState } from "react"
import TextInput from "@/src/components/text-input"
import PrimaryButton from "@/src/components/primary-button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getSupabaseBrowser } from "@/src/lib/supabase/browser-client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      const sb = getSupabaseBrowser()
      if (!sb) {
        setError("Supabase not configured")
        return
      }
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message || "Login failed")
        return
      }
      router.replace("/")
      // Ensure header sees hydrated session immediately after navigation
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload()
      }, 0)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold mb-6">Sign in</h1>
      <div className="space-y-4">
        <TextInput id="e" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput
          id="p"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          <PrimaryButton onClick={submit} loading={loading}>
            Sign in
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={() => router.push("/")}>
            Back
          </PrimaryButton>
        </div>
        <p className="text-xs text-neutral-600">
          No account? <Link href="/signup" className="underline">Create one</Link>
        </p>
        <p className="text-xs text-neutral-500">Use the email you signed up with.</p>
      </div>
    </div>
  )
}

