import { describe, it, expect } from "vitest";
import { edgeRuntimeOg } from "../src/checks/next/edge-runtime-og.js";
import { fixtureCtx } from "./helpers.js";

describe("edge-runtime-og", () => {
  it("flags a next/og route that declares the edge runtime", async () => {
    const findings = await edgeRuntimeOg.run(fixtureCtx("next-edge-og", "next"));
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("edge-runtime-og");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].file).toContain("route.tsx");
  });

  it("passes a next/og route on the node runtime", async () => {
    const findings = await edgeRuntimeOg.run(fixtureCtx("next-clean-og", "next"));
    expect(findings).toHaveLength(0);
  });
});
