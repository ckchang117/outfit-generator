import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/src/lib/supabase/server-client"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const next = url.searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await getSupabaseServer()
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code)
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }
  return NextResponse.redirect(new URL("/", url.origin))
}

