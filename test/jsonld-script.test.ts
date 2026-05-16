import { describe, it, expect } from "vitest";
import { usesScriptForJsonLd, jsonldScript } from "../src/checks/next/jsonld-script.js";
import { fixtureCtx } from "./helpers.js";

describe("usesScriptForJsonLd", () => {
  it("detects JSON-LD rendered through next/script <Script>", () => {
    expect(usesScriptForJsonLd('<Script id="ld" type="application/ld+json">')).toBe(true);
  });

  it("ignores plain <script> JSON-LD", () => {
    expect(usesScriptForJsonLd('<script type="application/ld+json">')).toBe(false);
  });
});

describe("jsonld-script check", () => {
  it("flags a file using <Script> for JSON-LD", async () => {
    const findings = await jsonldScript.run(fixtureCtx("next-jsonld-script", "next"));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].checkId).toBe("jsonld-script");
    expect(findings[0].severity).toBe("warning");
  });

  it("passes a file using plain <script>", async () => {
    const findings = await jsonldScript.run(fixtureCtx("next-jsonld-clean", "next"));
    expect(findings).toHaveLength(0);
  });
});
