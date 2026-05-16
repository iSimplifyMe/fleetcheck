import { describe, it, expect } from "vitest";
import {
  missingAeoElements,
  aeoRequirements,
} from "../src/checks/next/aeo-requirements.js";
import { fixtureCtx } from "./helpers.js";

describe("missingAeoElements", () => {
  it("lists AEO elements absent from a page", () => {
    const missing = missingAeoElements("<div>nothing here</div>");
    expect(missing).toContain("h1");
    expect(missing).toContain("AtomicAnswer");
  });

  it("returns empty when all AEO elements are present", () => {
    const content =
      '<h1>Title</h1><AtomicAnswer /><script type="application/ld+json">{"@type":"FAQPage"}</script>';
    expect(missingAeoElements(content)).toEqual([]);
  });
});

describe("aeo-requirements check", () => {
  it("flags a page missing AEO elements", async () => {
    const findings = await aeoRequirements.run(fixtureCtx("next-aeo-bad", "next"));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].checkId).toBe("aeo-requirements");
    expect(findings[0].severity).toBe("warning");
  });

  it("passes a page that has the AEO elements", async () => {
    const findings = await aeoRequirements.run(fixtureCtx("next-aeo-good", "next"));
    expect(findings).toHaveLength(0);
  });
});
