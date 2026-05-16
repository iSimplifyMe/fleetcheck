/**
 * fixer — plans and applies the safe mechanical fix class across the fleet.
 * Each fix lands as a worktree-based branch and a PR. It never merges and
 * never deploys.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ScanResult } from "./types.js";
import { bumpNextInPackageJson } from "./fixers/next-cve-bump.js";
import { addWorktreesToGitignore } from "./fixers/worktrees-gitignore-fix.js";

export const PATCHED_NEXT = "16.2.5";
const FIX_BRANCH = "fleetcheck/safe-fixes";
const COAUTHOR =
  "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>";

export interface FixPlan {
  repo: string;
  path: string;
  slug: string;
  nextBump: boolean;
  gitignoreFix: boolean;
}

export interface FixResult {
  repo: string;
  prUrl?: string;
  error?: string;
}

export interface RepoLocation {
  path: string;
  slug: string;
}

/** Compute the safe-class fixes available per repo from a scan. */
export function planFixes(
  scan: ScanResult,
  resolveRepo: (repo: string) => RepoLocation | undefined,
): FixPlan[] {
  const plans: FixPlan[] = [];
  for (const repo of scan.repos) {
    const nextBump = repo.findings.some(
      (f) => f.checkId === "next-cve" && f.fixable === true,
    );
    const gitignoreFix = repo.findings.some(
      (f) => f.checkId === "worktrees-gitignore",
    );
    if (!nextBump && !gitignoreFix) continue;
    const loc = resolveRepo(repo.repo);
    if (!loc) continue;
    plans.push({
      repo: repo.repo,
      path: loc.path,
      slug: loc.slug,
      nextBump,
      gitignoreFix,
    });
  }
  return plans;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function defaultBranch(repoPath: string): string {
  try {
    const ref = git(repoPath, [
      "symbolic-ref",
      "--short",
      "refs/remotes/origin/HEAD",
    ]).trim();
    return ref.replace(/^origin\//, "") || "main";
  } catch {
    return "main";
  }
}

function commitMessage(applied: string[]): string {
  return (
    `fleetcheck: safe fixes (${applied.join("; ")})\n\n` +
    "Automated safe-class remediation opened by fleetcheck.\n\n" +
    COAUTHOR
  );
}

function prTitle(plan: FixPlan): string {
  if (plan.nextBump && plan.gitignoreFix) {
    return "fleetcheck: Next.js CVE patch + .worktrees gitignore";
  }
  if (plan.nextBump) return "fleetcheck: bump Next.js to patch CVE-2026-44578";
  return "fleetcheck: ignore .worktrees/ in .gitignore";
}

function prBody(plan: FixPlan, applied: string[], base: string): string {
  const lines = [
    "Automated **safe-class** fixes from " +
      "[fleetcheck](https://github.com/iSimplifyMe/fleetcheck):",
    "",
    ...applied.map((a) => `- ${a}`),
    "",
    `Base: \`${base}\`.`,
  ];
  if (plan.nextBump) {
    lines.push(
      "",
      "⚠️ **Lockfile not updated.** `package.json` now requests " +
        `\`next@^${PATCHED_NEXT}\` (patches CVE-2026-44578 — SSRF, CVSS 8.6). ` +
        "Run `npm install` / `pnpm install` and commit the lockfile before merge.",
    );
  }
  lines.push("", "Review and merge manually — fleetcheck never merges or deploys.");
  return lines.join("\n");
}

/** Apply the planned fixes to one repo and open a PR. Never throws. */
export function applyFix(plan: FixPlan): FixResult {
  const base = defaultBranch(plan.path);
  const worktree = join(plan.path, ".worktrees", "fleetcheck-safe-fixes");

  try {
    git(plan.path, ["fetch", "origin", base, "--quiet"]);
    git(plan.path, [
      "worktree",
      "add",
      worktree,
      "-b",
      FIX_BRANCH,
      `origin/${base}`,
    ]);
  } catch (err) {
    return { repo: plan.repo, error: `worktree setup failed: ${errMessage(err)}` };
  }

  try {
    const applied: string[] = [];

    if (plan.nextBump) {
      const pkgPath = join(worktree, "package.json");
      if (existsSync(pkgPath)) {
        const bumped = bumpNextInPackageJson(
          readFileSync(pkgPath, "utf8"),
          PATCHED_NEXT,
        );
        if (bumped) {
          writeFileSync(pkgPath, bumped);
          applied.push(`bump \`next\` to \`^${PATCHED_NEXT}\` (CVE-2026-44578)`);
        }
      }
    }

    if (plan.gitignoreFix) {
      const giPath = join(worktree, ".gitignore");
      const current = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
      writeFileSync(giPath, addWorktreesToGitignore(current));
      applied.push("add `.worktrees/` to `.gitignore`");
    }

    if (applied.length === 0) {
      return { repo: plan.repo, error: "no changes produced" };
    }

    git(worktree, ["add", "-A"]);
    git(worktree, ["commit", "-m", commitMessage(applied)]);
    git(worktree, ["push", "-u", "origin", FIX_BRANCH, "--quiet"]);

    const url = execFileSync(
      "gh",
      [
        "pr", "create",
        "--repo", plan.slug,
        "--base", base,
        "--head", FIX_BRANCH,
        "--title", prTitle(plan),
        "--body", prBody(plan, applied, base),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();

    return { repo: plan.repo, prUrl: url };
  } catch (err) {
    return { repo: plan.repo, error: errMessage(err) };
  } finally {
    try {
      git(plan.path, ["worktree", "remove", worktree, "--force"]);
    } catch {
      /* worktree left in place; not fatal */
    }
  }
}
