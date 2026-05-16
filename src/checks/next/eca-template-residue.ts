/**
 * eca-template-residue — client sites are cloned from a starter template;
 * flag placeholder copy and template strings that were never replaced.
 */

import { join } from "node:path";
import { sourceFiles, readFileSafe } from "../lib.js";
import type { Check, Finding } from "../../types.js";

interface ResidueMarker {
  name: string;
  regex: RegExp;
  /** lowercased repo-name substrings that legitimately own this marker */
  ownedBy?: string[];
}

// Only unambiguous placeholder copy — strings with no legitimate reason to
// appear in shipped site copy. Template tokens like CLIENT_NAME are excluded:
// they are used intentionally in tenant/merge code and produce false positives.
const MARKERS: ResidueMarker[] = [
  { name: "lorem ipsum placeholder", regex: /lorem ipsum/i },
  {
    name: "placeholder phone number",
    regex: /\(?\b555\)?[\s.-]?555[\s.-]?5555\b/,
  },
];

/** Residue lives in shipped site code/content — not in docs or handoff notes. */
const RESIDUE_GLOBS = [
  "app/**/*.{ts,tsx,js,jsx,md,mdx}",
  "src/**/*.{ts,tsx,js,jsx,md,mdx}",
  "components/**/*.{ts,tsx,js,jsx}",
  "content/**/*.{md,mdx}",
];

/** Marker names found in a single line, given the owning repo. */
export function templateResidueHits(line: string, repoName: string): string[] {
  const repo = repoName.toLowerCase();
  const hits: string[] = [];
  for (const m of MARKERS) {
    if (m.ownedBy?.some((own) => repo.includes(own))) continue;
    if (m.regex.test(line)) hits.push(m.name);
  }
  return hits;
}

export const ecaTemplateResidue: Check = {
  id: "eca-template-residue",
  title: "No clone-template residue left in client copy",
  severity: "warning",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const rel of sourceFiles(repo.path, RESIDUE_GLOBS)) {
      const content = readFileSafe(join(repo.path, rel));
      if (!content) continue;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const marker of templateResidueHits(lines[i], repo.name)) {
          findings.push({
            checkId: "eca-template-residue",
            severity: "warning",
            message: `Template residue — ${marker}.`,
            file: rel,
            line: i + 1,
          });
        }
      }
    }
    return findings;
  },
};
