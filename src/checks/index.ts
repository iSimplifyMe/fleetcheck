/** Check registry. Checks are registered here as they are implemented. */

import type { Check } from "../types.js";
import { secretScan } from "./universal/secret-scan.js";
import { staleAwsCreds } from "./universal/stale-aws-creds.js";
import { worktreesGitignore } from "./universal/worktrees-gitignore.js";
import { nextCve } from "./next/next-cve.js";
import { edgeRuntimeOg } from "./next/edge-runtime-og.js";
import { dynamicParams } from "./next/dynamic-params.js";
import { jsonldScript } from "./next/jsonld-script.js";
import { blogUrlYear } from "./next/blog-url-year.js";
import { ecaTemplateResidue } from "./next/eca-template-residue.js";

// Universal checks apply to every repo.
// next/ checks apply only when `next` is a dependency (enforced via Check.appliesTo).
export const allChecks: Check[] = [
  // universal
  secretScan,
  staleAwsCreds,
  worktreesGitignore,
  // next.js / sst
  nextCve,
  edgeRuntimeOg,
  dynamicParams,
  jsonldScript,
  blogUrlYear,
  ecaTemplateResidue,
];
