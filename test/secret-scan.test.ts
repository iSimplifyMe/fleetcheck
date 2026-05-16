import { describe, it, expect } from "vitest";
import { secretScan } from "../src/checks/universal/secret-scan.js";
import { fixtureCtx } from "./helpers.js";

describe("secret-scan", () => {
  it("flags a committed AWS access key id", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-dirty"));
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("secret-scan");
    expect(findings[0].severity).toBe("security");
    expect(findings[0].file).toContain("config.ts");
    expect(findings[0].line).toBe(2);
  });

  it("reports nothing for a repo with no secrets", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-clean"));
    expect(findings).toHaveLength(0);
  });

  it("does not scan inside .claude/ agent-worktree directories", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-in-claude-dir"));
    expect(findings).toHaveLength(0);
  });
});
