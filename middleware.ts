import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

// No-op middleware: do not refresh Supabase session cookies
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}

