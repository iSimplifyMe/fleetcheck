/**
 * stale-aws-creds — detect deploy workflows whose recent runs failed on expired
 * or invalid AWS credentials. Joe's 5/14 rule: stale repo AWS creds break fleet
 * deploys; rotate before mass-merge.
 *
 * Network: queries `gh run`. Set FLEETCHECK_NO_NETWORK to skip. Returns no
 * findings (rather than throwing) whenever gh is unavailable.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { Check, Finding } from "../../types.js";

const DEPLOY_NAME_HINT = /deploy/i;
const DEPLOY_CONTENT_HINTS: RegExp[] = [
  /sst\s+deploy/i,
  /deploy\s+--stage/i,
  /aws-actions\/configure-aws-credentials/i,
  /aws\s+s3\s+sync/i,
];

/** List workflow filenames under .github/workflows that look like deploys. */
export function findDeployWorkflows(repoPath: string): string[] {
  const dir = join(repoPath, ".github", "workflows");
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const file of entries) {
    if (!/\.ya?ml$/i.test(file)) continue;
    if (DEPLOY_NAME_HINT.test(file)) {
      result.push(file);
      continue;
    }
    let content = "";
    try {
      content = readFileSync(join(dir, file), "utf8");
    } catch {
      continue;
    }
    if (DEPLOY_CONTENT_HINTS.some((re) => re.test(content))) {
      result.push(file);
    }
  }
  return result;
}

const CRED_FAILURE_PATTERNS: RegExp[] = [
  /invalidclienttokenid/i,
  /expiredtoken/i,
  /security token[\s\S]{0,80}(invalid|expired)/i,
  /aws[\s\S]{0,40}credential[\s\S]{0,40}(invalid|expired|not\s+found)/i,
  /the request signature we calculated does not match/i,
];

/** True when a workflow run log shows an AWS credential failure. */
export function isCredentialFailureLog(log: string): boolean {
  return CRED_FAILURE_PATTERNS.some((re) => re.test(log));
}

interface GhRun {
  databaseId: number;
  conclusion: string | null;
  status: string;
}

function gh(args: string[]): string {
  return execFileSync("gh", args, {
    encoding: "utf8",
    timeout: 45_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export const staleAwsCreds: Check = {
  id: "stale-aws-creds",
  title: "Deploy workflows free of AWS credential failures",
  severity: "warning",
  appliesTo: () => true,
  run(repo): Finding[] {
    if (process.env.FLEETCHECK_NO_NETWORK) return [];
    if (!repo.slug) return [];
    const workflows = findDeployWorkflows(repo.path);
    if (workflows.length === 0) return [];

    const findings: Finding[] = [];
    for (const wf of workflows) {
      let runs: GhRun[];
      try {
        const out = gh([
          "run", "list",
          "--repo", repo.slug,
          "--workflow", wf,
          "--limit", "10",
          "--json", "databaseId,conclusion,status",
        ]);
        runs = JSON.parse(out) as GhRun[];
      } catch {
        continue; // gh unavailable, or workflow never ran
      }
      const failed = runs.filter((r) => r.conclusion === "failure");
      if (failed.length === 0) continue;

      // Inspect the most recent failed run's log for credential errors.
      const latest = failed[0];
      let log = "";
      try {
        log = gh([
          "run", "view", String(latest.databaseId),
          "--repo", repo.slug,
          "--log-failed",
        ]);
      } catch {
        // log unavailable — cannot confirm a credential cause
      }
      if (log && isCredentialFailureLog(log)) {
        findings.push({
          checkId: "stale-aws-creds",
          severity: "warning",
          message:
            `Deploy workflow \`${wf}\` failed on an AWS credential error ` +
            `(run ${latest.databaseId}). Rotate this repo's ` +
            `AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY secrets.`,
          file: `.github/workflows/${wf}`,
          meta: { runId: latest.databaseId, workflow: wf },
        });
      }
    }
    return findings;
  },
};
