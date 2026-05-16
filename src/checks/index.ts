/** Check registry. Checks are registered here as they are implemented. */

import type { Check } from "../types.js";
import { secretScan } from "./universal/secret-scan.js";
import { staleAwsCreds } from "./universal/stale-aws-creds.js";
import { worktreesGitignore } from "./universal/worktrees-gitignore.js";

// Universal checks apply to every repo.
// next/ checks apply only when `next` is a dependency (enforced via Check.appliesTo).
export const allChecks: Check[] = [
  secretScan,
  staleAwsCreds,
  worktreesGitignore,
];
