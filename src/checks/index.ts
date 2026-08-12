/** Check registry. Checks are registered here as they are implemented. */

import type { Check } from "../types.js";
import { secretScan } from "./universal/secret-scan.js";
import { staleAwsCreds } from "./universal/stale-aws-creds.js";
import { worktreesGitignore } from "./universal/worktrees-gitignore.js";
import { sstSecretFallback } from "./universal/sst-secret-fallback.js";
import { ahpraSchemaGuard } from "./universal/ahpra-schema-guard.js";
import { bedrockThinkingParse } from "./universal/bedrock-thinking-parse.js";
import { forkIdentityConsistency } from "./universal/fork-identity-consistency.js";
import { nextCve } from "./next/next-cve.js";
import { authedCacheLeak } from "./next/authed-cache-leak.js";
import { opennextVersionPin } from "./next/opennext-version-pin.js";
import { edgeRuntimeOg } from "./next/edge-runtime-og.js";
import { dynamicParams } from "./next/dynamic-params.js";
import { jsonldScript } from "./next/jsonld-script.js";
import { blogUrlYear } from "./next/blog-url-year.js";
import { ecaTemplateResidue } from "./next/eca-template-residue.js";
import { publicDirCollision } from "./next/public-dir-collision.js";
import { aeoRequirements } from "./next/aeo-requirements.js";
import { blogSchemaSpokes } from "./next/blog-schema-spokes.js";

// Universal checks apply to every repo.
// next/ checks apply only when `next` is a dependency (enforced via Check.appliesTo).
export const allChecks: Check[] = [
  // universal
  secretScan,
  staleAwsCreds,
  worktreesGitignore,
  sstSecretFallback,
  ahpraSchemaGuard,
  bedrockThinkingParse,
  forkIdentityConsistency,
  // next.js / sst
  nextCve,
  authedCacheLeak,
  opennextVersionPin,
  edgeRuntimeOg,
  dynamicParams,
  jsonldScript,
  blogUrlYear,
  ecaTemplateResidue,
  publicDirCollision,
  aeoRequirements,
  blogSchemaSpokes,
];
