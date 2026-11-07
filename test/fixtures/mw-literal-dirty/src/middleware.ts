import { NextResponse, type NextRequest } from "next/server";

// Provenance: the exclusions came over from the fork parent's /legacy/hero.png era.
export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p.startsWith("/_next/") || p.startsWith("/favicon.ico")) return NextResponse.next();
  if (p === "/images/hero.jpg") return NextResponse.next();
  if (p === "/api/health.json") return NextResponse.next();
  if (req.headers.get("x-origin-verify") !== process.env.ORIGIN_VERIFY) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}
