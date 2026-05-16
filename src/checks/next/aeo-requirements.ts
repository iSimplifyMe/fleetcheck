/**
 * aeo-requirements — surfaces how many App Router pages lack the core AEO
 * scaffolding (an h1, an AtomicAnswer block, FAQ schema). Reported as one
 * info-level summary per repo: it is a heuristic (page file + co-located
 * layout only — scaffolding inside imported components is not visible), so
 * it informs rather than fails a build.
 */

import { join, dirname } from "node:path";
import { readFileSafe, appPageFiles } from "../lib.js";
import type { Check, Finding } from "../../types.js";

interface AeoElement {
  name: string;
  test: (content: string) => boolean;
}

const AEO_ELEMENTS: AeoElement[] = [
  { name: "h1", test: (c) => /<h1[\s>]/.test(c) },
  { name: "AtomicAnswer", test: (c) => /\bAtomicAnswer\b/.test(c) },
  { name: "FAQ schema", test: (c) => /FAQPage/.test(c) },
];

/** AEO element names absent from the given page content. */
export function missingAeoElements(content: string): string[] {
  return AEO_ELEMENTS.filter((el) => !el.test(content)).map((el) => el.name);
}

export const aeoRequirements: Check = {
  id: "aeo-requirements",
  title: "Pages carry the required AEO scaffolding",
  severity: "info",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const pages = appPageFiles(repo.path);
    if (pages.length === 0) return [];

    let incomplete = 0;
    const tally: Record<string, number> = {};
    for (const page of pages) {
      let content = readFileSafe(join(repo.path, page)) ?? "";
      const layout = readFileSafe(join(repo.path, dirname(page), "layout.tsx"));
      if (layout) content += "\n" + layout;

      const missing = missingAeoElements(content);
      if (missing.length > 0) {
        incomplete++;
        for (const m of missing) tally[m] = (tally[m] ?? 0) + 1;
      }
    }
    if (incomplete === 0) return [];

    const parts = Object.entries(tally).map(([name, n]) => `${n}x ${name}`);
    return [
      {
        checkId: "aeo-requirements",
        severity: "info",
        message:
          `${incomplete}/${pages.length} pages missing AEO scaffolding ` +
          `(${parts.join(", ")}) — heuristic, page file + layout only.`,
      },
    ];
  },
};
