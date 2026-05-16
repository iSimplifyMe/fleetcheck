import { describe, it, expect } from "vitest";
import { worktreesGitignore } from "../src/checks/universal/worktrees-gitignore.js";
import { fixtureCtx } from "./helpers.js";

describe("worktrees-gitignore", () => {
  it("flags a .gitignore missing the .worktrees entry", async () => {
    const findings = await worktreesGitignore.run(fixtureCtx("wt-missing"));
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("worktrees-gitignore");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].fixable).toBe(true);
  });

  it("passes a .gitignore that contains .worktrees", async () => {
    const findings = await worktreesGitignore.run(fixtureCtx("wt-present"));
    expect(findings).toHaveLength(0);
  });

  it("flags a repo with no .gitignore at all", async () => {
    const findings = await worktreesGitignore.run(fixtureCtx("wt-none"));
    expect(findings).toHaveLength(1);
  });
});
