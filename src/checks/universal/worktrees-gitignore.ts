/**
 * worktrees-gitignore — every repo's .gitignore must ignore `.worktrees/`.
 * Joe's worktree rule: parallel Claude Code sessions use `.worktrees/`; if it
 * isn't ignored, generated worktrees get committed and sessions collide.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Check, Finding } from "../../types.js";

export const worktreesGitignore: Check = {
  id: "worktrees-gitignore",
  title: ".worktrees/ present in .gitignore",
  severity: "warning",
  appliesTo: () => true,
  run(repo): Finding[] {
    const gitignorePath = join(repo.path, ".gitignore");
    const contents = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, "utf8")
      : "";

    const hasEntry = contents.split(/\r?\n/).some((line) => {
      const trimmed = line.trim();
      return trimmed === ".worktrees" || trimmed === ".worktrees/";
    });
    if (hasEntry) return [];

    return [
      {
        checkId: "worktrees-gitignore",
        severity: "warning",
        message:
          ".gitignore does not ignore `.worktrees/` — parallel Claude Code sessions can commit worktrees and collide. Add a `.worktrees/` line.",
        file: ".gitignore",
        fixable: true,
      },
    ];
  },
};
