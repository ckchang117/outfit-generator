import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/src/lib/supabase/server-client"

type Body = { email?: string; password?: string }

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as Body
  if (!email || !password) {
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 400 })
  }

  const supabase = await getSupabaseServer()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 })

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return NextResponse.json({ error: error.message || "Login failed" }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}

