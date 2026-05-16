import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export function GET() {
  return new ImageResponse(<div style={{ display: "flex" }}>hello</div>);
}
