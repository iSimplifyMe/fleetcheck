import { describe, it, expect } from "vitest";
import { planFixes } from "../src/fixer.js";
import type { ScanResult } from "../src/types.js";

const scan: ScanResult = {
  generatedAt: "now",
  repos: [
    {
      repo: "alpha",
      kind: "next",
      durationMs: 1,
      errors: {},
      findings: [
        { checkId: "next-cve", severity: "security", message: "x", fixable: true },
        { checkId: "worktrees-gitignore", severity: "warning", message: "y", fixable: true },
      ],
    },
    {
      repo: "beta",
      kind: "next",
      durationMs: 1,
      errors: {},
      findings: [
        { checkId: "next-cve", severity: "info", message: "z", fixable: false },
      ],
    },
    { repo: "gamma", kind: "other", durationMs: 1, errors: {}, findings: [] },
  ],
};

const resolve = (r: string) => ({ path: "/x/" + r, slug: "o/" + r });

describe("planFixes", () => {
  it("plans both fixes for a repo with fixable findings", () => {
    const plans = planFixes(scan, resolve);
    const alpha = plans.find((p) => p.repo === "alpha");
    expect(alpha).toBeDefined();
    expect(alpha!.nextBump).toBe(true);
    expect(alpha!.gitignoreFix).toBe(true);
  });

  it("skips a repo whose next-cve finding is not fixable", () => {
    const plans = planFixes(scan, resolve);
    expect(plans.find((p) => p.repo === "beta")).toBeUndefined();
  });

  it("skips repos with no fixable findings", () => {
    const plans = planFixes(scan, resolve);
    expect(plans.find((p) => p.repo === "gamma")).toBeUndefined();
  });

  it("skips repos that cannot be resolved to a path and slug", () => {
    expect(planFixes(scan, () => undefined)).toHaveLength(0);
  });
});
