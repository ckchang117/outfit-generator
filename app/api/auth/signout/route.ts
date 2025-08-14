import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/src/lib/supabase/server-client"

export async function POST() {
  const supabase = await getSupabaseServer()
  if (supabase) {
    await supabase.auth.signOut()
  }
  return NextResponse.json({ ok: true })
}

