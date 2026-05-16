/**
 * edge-runtime-og — a file that imports `next/og` must not run on the edge
 * runtime. Edge + next/og breaks OG image generation in this stack.
 */

import { join } from "node:path";
import { sourceFiles, readFileSafe } from "../lib.js";
import type { Check, Finding } from "../../types.js";

const IMPORTS_NEXT_OG = /from\s+['"]next\/og['"]/;
const EDGE_RUNTIME = /export\s+const\s+runtime\s*=\s*['"]edge['"]/;

export const edgeRuntimeOg: Check = {
  id: "edge-runtime-og",
  title: "next/og files do not use the edge runtime",
  severity: "error",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const rel of sourceFiles(repo.path)) {
      const content = readFileSafe(join(repo.path, rel));
      if (!content) continue;
      if (IMPORTS_NEXT_OG.test(content) && EDGE_RUNTIME.test(content)) {
        findings.push({
          checkId: "edge-runtime-og",
          severity: "error",
          message:
            "File imports `next/og` and declares `runtime = 'edge'` — this breaks " +
            "OG image generation. Remove the edge runtime export.",
          file: rel,
        });
      }
    }
    return findings;
  },
};
