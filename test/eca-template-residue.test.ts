import { describe, it, expect } from "vitest";
import {
  templateResidueHits,
  ecaTemplateResidue,
} from "../src/checks/next/eca-template-residue.js";
import { fixtureCtx } from "./helpers.js";

describe("templateResidueHits", () => {
  it("flags placeholder copy and phone numbers", () => {
    expect(templateResidueHits("Lorem ipsum dolor sit amet", "marque-cars").length).toBeGreaterThan(0);
    expect(templateResidueHits("Call us at (555) 555-5555", "marque-cars").length).toBeGreaterThan(0);
  });

  it("ignores clean content", () => {
    expect(templateResidueHits("Welcome to Marque Cars", "marque-cars")).toEqual([]);
  });
});

describe("eca-template-residue check", () => {
  it("flags template residue in a client repo", async () => {
    const findings = await ecaTemplateResidue.run(fixtureCtx("next-residue", "next"));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].checkId).toBe("eca-template-residue");
    expect(findings[0].severity).toBe("warning");
  });

  it("passes a clean repo", async () => {
    const findings = await ecaTemplateResidue.run(fixtureCtx("next-clean-og", "next"));
    expect(findings).toHaveLength(0);
  });
});
