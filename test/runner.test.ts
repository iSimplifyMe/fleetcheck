import { describe, it, expect } from "vitest";
import { runChecks } from "../src/runner.js";
import type { Check, RepoContext } from "../src/types.js";

const repo: RepoContext = {
  name: "x",
  path: "/tmp/x",
  kind: "other",
  hasNext: false,
};

const goodCheck: Check = {
  id: "good",
  title: "good",
  severity: "warning",
  appliesTo: () => true,
  run: () => [{ checkId: "good", severity: "warning", message: "found" }],
};

const throwingCheck: Check = {
  id: "boom",
  title: "boom",
  severity: "error",
  appliesTo: () => true,
  run: () => {
    throw new Error("kaboom");
  },
};

const skippedCheck: Check = {
  id: "skipped",
  title: "skipped",
  severity: "info",
  appliesTo: () => false,
  run: () => [{ checkId: "skipped", severity: "info", message: "nope" }],
};

describe("runChecks", () => {
  it("collects findings from passing checks", async () => {
    const result = await runChecks(repo, [goodCheck]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].checkId).toBe("good");
  });

  it("isolates a throwing check without aborting the scan", async () => {
    const result = await runChecks(repo, [goodCheck, throwingCheck]);
    expect(result.findings).toHaveLength(1);
    expect(result.errors.boom).toContain("kaboom");
  });

  it("skips checks whose appliesTo returns false", async () => {
    const result = await runChecks(repo, [skippedCheck]);
    expect(result.findings).toHaveLength(0);
    expect(result.errors).toEqual({});
  });
});
