/**
 * never-run-prod-workflow — a dispatch-only production deploy workflow with
 * ZERO runs is an untested deploy path, and the first dispatch is the test.
 *
 * Origin incident (labreastandbody, 2026-11-07): production had always been
 * deployed from a Mac; `deploy-production.yml` existed, dispatch-only, never
 * run. Its first-ever dispatch — during a fleet-wide headers rollout — ran
 * without an env var the config needs and deployed `domain: undefined`,
 * deleting the live DNS (~30 min dark). "Dispatch-only" protects against
 * pushes; it is not evidence the workflow works.
 *
 * Network: `gh run list` per candidate workflow (same posture as
 * stale-aws-creds). Set FLEETCHECK_NO_NETWORK to skip; any gh failure yields
 * no findings rather than an error. Static parts (which workflows are
 * candidates) are exported and tested without the network.
 */

import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import {
  isDispatchOnly,
  isProductionDeploy,
  parseTriggers,
  readWorkflows,
  type WorkflowFile,
} from "../workflow-lib.js";
import type { Check, Finding } from "../../types.js";

const CHECK_ID = "never-run-prod-workflow";

/** Production deploy workflows that only ever run by hand. */
export function dispatchOnlyProductionWorkflows(repoPath: string): WorkflowFile[] {
  return readWorkflows(repoPath).filter(
    (w) => isProductionDeploy(w.content) && isDispatchOnly(parseTriggers(w.content)),
  );
}

/** Number of recorded runs (capped at 1 — we only need zero vs some); null when gh cannot say. */
export function recordedRunCount(slug: string, workflowFile: string): number | null {
  try {
    const out = execFileSync(
      "gh",
      [
        "run", "list",
        "--repo", slug,
        "--workflow", basename(workflowFile),
        "--limit", "1",
        "--json", "databaseId",
      ],
      { encoding: "utf8", timeout: 45_000, stdio: ["ignore", "pipe", "ignore"] },
    );
    const runs = JSON.parse(out) as unknown[];
    return Array.isArray(runs) ? runs.length : null;
  } catch {
    return null;
  }
}

export const neverRunProdWorkflow: Check = {
  id: CHECK_ID,
  title: "Dispatch-only production deploy workflows have run at least once",
  severity: "warning",
  appliesTo: () => true,
  run(repo): Finding[] {
    if (process.env.FLEETCHECK_NO_NETWORK) return [];
    if (!repo.slug) return [];
    const findings: Finding[] = [];
    for (const wf of dispatchOnlyProductionWorkflows(repo.path)) {
      if (recordedRunCount(repo.slug, wf.file) !== 0) continue;
      findings.push({
        checkId: CHECK_ID,
        severity: "warning",
        message:
          `dispatch-only production workflow has NEVER run — its first dispatch is an untested ` +
          `deploy path (labreastandbody 2026-11-07: the first-ever run deployed \`domain: undefined\` ` +
          `and deleted the live DNS). Before dispatching: list every \`process.env.*\` sst.config.ts ` +
          `reads and prove the workflow sets each one, then \`sst diff --stage production\`; a ` +
          `\`Delete … DnsRecord / Certificate\` line is the teardown announcing itself`,
        file: wf.file,
        meta: { workflow: basename(wf.file) },
      });
    }
    return findings;
  },
};
