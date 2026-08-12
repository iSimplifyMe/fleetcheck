import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Client-side-auth app: middleware only prevents CDN caching of app pages. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStatic = pathname.startsWith("/_next/") || pathname.includes(".");
  const response = NextResponse.next();
  if (!isStatic) {
    response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  }
  return response;
}
