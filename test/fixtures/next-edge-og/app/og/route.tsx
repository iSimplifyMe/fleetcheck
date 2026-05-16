import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(<div style={{ display: "flex" }}>hello</div>);
}
