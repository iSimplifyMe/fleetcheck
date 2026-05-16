import { describe, it, expect } from "vitest";
import { assessNextCve, nextCve } from "../src/checks/next/next-cve.js";
import type { RepoContext } from "../src/types.js";

describe("assessNextCve", () => {
  it("flags a resolved version below the patch as vulnerable and fixable (major 16)", () => {
    const a = assessNextCve("^16.1.0", "16.1.9");
    expect(a.status).toBe("vulnerable");
    expect(a.fixable).toBe(true);
  });

  it("treats a resolved or pinned version at/above the patch as patched", () => {
    expect(assessNextCve("^16.1.0", "16.4.2").status).toBe("patched");
    expect(assessNextCve("16.2.5").status).toBe("patched");
  });

  it("flags a range whose floor is below the patch as uncertain", () => {
    const a = assessNextCve("^16.1.0");
    expect(a.status).toBe("uncertain");
    expect(a.fixable).toBe(true);
  });

  it("marks a pre-16 major as vulnerable but not auto-fixable", () => {
    const a = assessNextCve("15.1.0", "15.1.0");
    expect(a.status).toBe("vulnerable");
    expect(a.fixable).toBe(false);
  });

  it("returns unknown for an unresolvable spec", () => {
    expect(assessNextCve("latest").status).toBe("unknown");
  });
});

describe("next-cve check", () => {
  it("emits a finding for a repo on a vulnerable Next range", async () => {
    const repo: RepoContext = {
      name: "x",
      path: "/tmp/fleetcheck-test-none",
      kind: "next",
      hasNext: true,
      packageJson: { dependencies: { next: "^16.1.0" } },
    };
    const findings = await nextCve.run(repo);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("next-cve");
    expect(findings[0].severity).toBe("warning");
  });

  it("stays silent for a repo on a patched Next", async () => {
    const repo: RepoContext = {
      name: "x",
      path: "/tmp/fleetcheck-test-none",
      kind: "next",
      hasNext: true,
      packageJson: { dependencies: { next: "16.2.5" } },
    };
    expect(await nextCve.run(repo)).toHaveLength(0);
  });
});
