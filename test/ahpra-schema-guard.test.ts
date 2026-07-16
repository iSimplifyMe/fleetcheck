import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ahpraSchemaGuard,
  countSchemaOccurrences,
  AHPRA_REPOS,
} from "../src/checks/universal/ahpra-schema-guard.js";
import { classifyRepo } from "../src/fleet.js";
import type { RepoContext } from "../src/types.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

function ctxAt(name: string, fixture: string, settings?: Record<string, unknown>): RepoContext {
  return {
    name,
    path: resolve(fixtures, fixture),
    kind: "next",
    hasNext: true,
    settings,
  };
}

describe("countSchemaOccurrences", () => {
  it("counts AggregateRating and Review @type declarations", () => {
    expect(countSchemaOccurrences(`'@type': 'AggregateRating',`)).toBe(1);
    expect(countSchemaOccurrences(`"@type": "Review"`)).toBe(1);
    expect(countSchemaOccurrences(`"@type":"Review"`)).toBe(1);
  });

  it("does not count ReviewAction types or the lowercase aggregateRating property key", () => {
    expect(countSchemaOccurrences(`"@type": "ReviewAction"`)).toBe(0);
    expect(countSchemaOccurrences("aggregateRating: {")).toBe(0);
  });
});

describe("ahpra-schema-guard scoping", () => {
  it("applies to the pinned AU medical repos", () => {
    expect(AHPRA_REPOS).toContain("signature-dentistry");
    expect(AHPRA_REPOS).toContain("precision-health-i18n");
    expect(ahpraSchemaGuard.appliesTo(ctxAt("signature-dentistry", "ahpra-at-baseline"))).toBe(true);
  });

  it("applies to any repo that opts in via settings, and to nothing else", () => {
    expect(
      ahpraSchemaGuard.appliesTo(
        ctxAt("some-other-repo", "ahpra-at-baseline", {
          "ahpra-schema-guard": { baseline: 1 },
        }),
      ),
    ).toBe(true);
    expect(ahpraSchemaGuard.appliesTo(ctxAt("some-other-repo", "ahpra-at-baseline"))).toBe(false);
  });
});

describe("ahpra-schema-guard check", () => {
  it("fails when occurrences exceed the .fleetcheckrc.json baseline", async () => {
    // classifyRepo loads the fixture's .fleetcheckrc.json (baseline: 1).
    const ctx = classifyRepo({ name: "ahpra-over-baseline" }, fixtures);
    const findings = await ahpraSchemaGuard.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("security");
    expect(findings[0].message).toContain("AHPRA s133");
    expect(findings[0].meta).toMatchObject({ count: 2, baseline: 1 });
  });

  it("passes when occurrences equal the baseline (existing schema stays)", async () => {
    const ctx = classifyRepo({ name: "ahpra-at-baseline" }, fixtures);
    expect(await ahpraSchemaGuard.run(ctx)).toEqual([]);
  });

  it("defaults the baseline to 0 and says how to pin when unconfigured", async () => {
    const ctx = ctxAt("signature-dentistry", "ahpra-at-baseline");
    const findings = await ahpraSchemaGuard.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("security");
    expect(findings[0].message).toContain(".fleetcheckrc.json");
  });

  it("reports a stale (too-high) baseline as info", async () => {
    const ctx = ctxAt("signature-dentistry", "ahpra-at-baseline", {
      "ahpra-schema-guard": { baseline: 5 },
    });
    const findings = await ahpraSchemaGuard.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("Re-pin");
  });
});
