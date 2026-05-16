/**
 * dynamic-params — flag `dynamicParams = false`. It is correct only when
 * generateStaticParams is exhaustive; surface every occurrence for review.
 */

import { join } from "node:path";
import { sourceFiles, readFileSafe, matchingLines } from "../lib.js";
import type { Check, Finding } from "../../types.js";

const DYNAMIC_PARAMS_FALSE = /dynamicParams\s*=\s*false/;

export const dynamicParams: Check = {
  id: "dynamic-params",
  title: "dynamicParams = false reviewed",
  severity: "warning",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const rel of sourceFiles(repo.path)) {
      const content = readFileSafe(join(repo.path, rel));
      if (!content) continue;
      for (const hit of matchingLines(content, DYNAMIC_PARAMS_FALSE)) {
        findings.push({
          checkId: "dynamic-params",
          severity: "warning",
          message:
            "`dynamicParams = false` — verify generateStaticParams is exhaustive, " +
            "or unmatched routes will 404.",
          file: rel,
          line: hit.line,
        });
      }
    }
    return findings;
  },
};
