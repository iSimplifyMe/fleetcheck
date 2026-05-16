import { describe, it, expect } from "vitest";
import { renderMatrix } from "../src/reporters/markdown.js";
import type { ScanResult } from "../src/types.js";

const scan: ScanResult = {
  generatedAt: "2026-05-16T00:00:00.000Z",
  repos: [
    { repo: "clean-repo", kind: "next", durationMs: 1, errors: {}, findings: [] },
    {
      repo: "risky-repo",
      kind: "next",
      durationMs: 1,
      errors: {},
      findings: [
        { checkId: "secret-scan", severity: "security", message: "leak" },
        { checkId: "dynamic-params", severity: "warning", message: "check" },
      ],
    },
  ],
};

describe("renderMatrix", () => {
  it("renders the heading, both repos, and the totals line", () => {
    const md = renderMatrix(scan);
    expect(md).toContain("# Fleet Health & Security Matrix");
    expect(md).toContain("clean-repo");
    expect(md).toContain("risky-repo");
    expect(md).toContain("2** repos scanned");
  });

  it("sorts the worst repo first", () => {
    const md = renderMatrix(scan);
    expect(md.indexOf("risky-repo")).toBeLessThan(md.indexOf("clean-repo"));
  });

  it("lists findings in the per-repo detail section", () => {
    const md = renderMatrix(scan);
    expect(md).toContain("## Detail");
    expect(md).toContain("secret-scan");
  });
});
