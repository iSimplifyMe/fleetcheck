/** Runs the applicable checks against a single repo and collects findings. */

import type { Check, Finding, RepoContext, RepoResult } from "./types.js";

export async function runChecks(repo: RepoContext, checks: Check[]): Promise<RepoResult> {
  const start = Date.now();
  const findings: Finding[] = [];
  const errors: Record<string, string> = {};

  for (const check of checks) {
    if (!check.appliesTo(repo)) continue;
    try {
      const result = await check.run(repo);
      findings.push(...result);
    } catch (err) {
      errors[check.id] = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    repo: repo.name,
    kind: repo.kind,
    findings,
    errors,
    durationMs: Date.now() - start,
  };
}
