import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

// Temporarily disable middleware to debug
export function middleware(request: NextRequest) {
  console.log("[Middleware] Request to:", request.nextUrl.pathname)
  return NextResponse.next()
}

export const config = {
  matcher: [],
}

