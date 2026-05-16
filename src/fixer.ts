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
import {
  PATCHED,
  assessNextCve,
  resolvedNextFromLockfile,
} from "./checks/next/next-cve.js";

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
  /** set when the repo needed no change (e.g. base branch already patched) */
  note?: string;
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

function tryGit(repoPath: string, args: string[]): void {
  try {
    git(repoPath, args);
  } catch {
    /* best effort */
  }
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

/** Remove any worktree/branch left by a prior interrupted run. */
function cleanStaleFixState(repoPath: string, worktree: string): void {
  tryGit(repoPath, ["worktree", "remove", "--force", worktree]);
  tryGit(repoPath, ["worktree", "prune"]);
  tryGit(repoPath, ["branch", "-D", FIX_BRANCH]);
}

function commitMessage(applied: string[]): string {
  return (
    `fleetcheck: safe fixes (${applied.join("; ")})\n\n` +
    "Automated safe-class remediation opened by fleetcheck.\n\n" +
    COAUTHOR
  );
}

function prTitle(appliedNext: boolean, appliedGitignore: boolean): string {
  if (appliedNext && appliedGitignore) {
    return "fleetcheck: Next.js CVE patch + .worktrees gitignore";
  }
  if (appliedNext) return "fleetcheck: bump Next.js to patch CVE-2026-44578";
  return "fleetcheck: ignore .worktrees/ in .gitignore";
}

function prBody(appliedNext: boolean, applied: string[], base: string): string {
  const lines = [
    "Automated **safe-class** fixes from " +
      "[fleetcheck](https://github.com/iSimplifyMe/fleetcheck):",
    "",
    ...applied.map((a) => `- ${a}`),
    "",
    `Base: \`${base}\`.`,
  ];
  if (appliedNext) {
    lines.push(
      "",
      "⚠️ **Lockfile not updated.** `package.json` now requests " +
        `\`next@^${PATCHED}\` (patches CVE-2026-44578 — SSRF, CVSS 8.6). ` +
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

  cleanStaleFixState(plan.path, worktree);
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
    let appliedNext = false;
    let appliedGitignore = false;

    if (plan.nextBump) {
      const pkgPath = join(worktree, "package.json");
      if (existsSync(pkgPath)) {
        const pkgText = readFileSync(pkgPath, "utf8");
        const spec = pkgText.match(/"next"\s*:\s*"([^"]+)"/)?.[1];
        // Re-assess against the base branch: the scan may have read a stale
        // local branch where `next` was older than the deployed default.
        if (spec) {
          const assessment = assessNextCve(
            spec,
            resolvedNextFromLockfile(worktree),
          );
          if (assessment.status !== "patched") {
            const bumped = bumpNextInPackageJson(pkgText, PATCHED);
            if (bumped && bumped !== pkgText) {
              writeFileSync(pkgPath, bumped);
              applied.push(`bump \`next\` to \`^${PATCHED}\` (CVE-2026-44578)`);
              appliedNext = true;
            }
          }
        }
      }
    }

    if (plan.gitignoreFix) {
      const giPath = join(worktree, ".gitignore");
      const current = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
      const updated = addWorktreesToGitignore(current);
      if (updated !== current) {
        writeFileSync(giPath, updated);
        applied.push("add `.worktrees/` to `.gitignore`");
        appliedGitignore = true;
      }
    }

    if (applied.length === 0) {
      return {
        repo: plan.repo,
        note: `no changes needed — base \`${base}\` is already up to date`,
      };
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
        "--title", prTitle(appliedNext, appliedGitignore),
        "--body", prBody(appliedNext, applied, base),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();

    return { repo: plan.repo, prUrl: url };
  } catch (err) {
    return { repo: plan.repo, error: errMessage(err) };
  } finally {
    tryGit(plan.path, ["worktree", "remove", "--force", worktree]);
  }
}
