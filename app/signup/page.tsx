"use client"

import { useState } from "react"
import TextInput from "@/src/components/text-input"
import PrimaryButton from "@/src/components/primary-button"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const submit = async () => {
    setLoading(true)
    setError(null)
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    setLoading(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || "Signup failed")
      return
    }
    router.push("/")
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold mb-6">Create account</h1>
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
            Sign up
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={() => router.push("/")}>
            Back
          </PrimaryButton>
        </div>
        <p className="text-xs text-neutral-600">
          Already have an account? <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

