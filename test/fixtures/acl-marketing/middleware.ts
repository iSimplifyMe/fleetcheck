import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Marketing template gate: no session, redirects to a coming-soon page. */
export function middleware(request: NextRequest) {
  const launched = request.cookies.get("preview-gate")?.value === "open";
  if (!launched && request.nextUrl.pathname !== "/coming-soon") {
    return NextResponse.redirect(new URL("/coming-soon", request.url));
  }
  return NextResponse.next();
}
