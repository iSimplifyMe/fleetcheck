import { describe, it, expect } from "vitest";
import { dynamicParams } from "../src/checks/next/dynamic-params.js";
import { fixtureCtx } from "./helpers.js";

describe("dynamic-params", () => {
  it("flags `dynamicParams = false` for review", async () => {
    const findings = await dynamicParams.run(fixtureCtx("next-dynparams", "next"));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].checkId).toBe("dynamic-params");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].file).toContain("page.tsx");
  });

  it("passes a repo with no dynamicParams override", async () => {
    const findings = await dynamicParams.run(fixtureCtx("next-clean-og", "next"));
    expect(findings).toHaveLength(0);
  });
});
