/**
 * jsonld-script — JSON-LD must be rendered with a plain `<script>` tag, not
 * the next/script `<Script>` component (which can defer or relocate it,
 * breaking structured-data discovery).
 */

import { join } from "node:path";
import { sourceFiles, readFileSafe } from "../lib.js";
import type { Check, Finding } from "../../types.js";

const SCRIPT_JSONLD = /<Script\b[\s\S]{0,200}?ld\+json/;

export function usesScriptForJsonLd(content: string): boolean {
  return SCRIPT_JSONLD.test(content);
}

export const jsonldScript: Check = {
  id: "jsonld-script",
  title: "JSON-LD rendered with plain <script>, not next/script",
  severity: "warning",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const rel of sourceFiles(repo.path)) {
      const content = readFileSafe(join(repo.path, rel));
      if (!content) continue;
      if (usesScriptForJsonLd(content)) {
        findings.push({
          checkId: "jsonld-script",
          severity: "warning",
          message:
            "JSON-LD rendered through next/script `<Script>` — it can be deferred " +
            "or relocated. Render JSON-LD with a plain `<script>` tag.",
          file: rel,
        });
      }
    }
    return findings;
  },
};
