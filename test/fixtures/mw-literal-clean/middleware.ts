import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p.includes(".")) return NextResponse.next();
  if (p === "/favicon.ico" || p === "/robots.txt" || p === "/sitemap.xml") return NextResponse.next();
  if (p === "/site.webmanifest" || p === "/icon.png" || p === "/_next/static/chunk.js") return NextResponse.next();
  if (p === "/feed.xml") return NextResponse.next();
  return NextResponse.next();
}
