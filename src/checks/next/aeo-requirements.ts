/**
 * aeo-requirements — every page should carry the core AEO scaffolding: an h1,
 * an AtomicAnswer block, and FAQ schema. Heuristic: scans the page file plus a
 * co-located layout; scaffolding inside imported components is not visible.
 */

import { join, dirname } from "node:path";
import { globbySync } from "globby";
import { readFileSafe } from "../lib.js";
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
  severity: "warning",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    const pages = globbySync(["app/**/page.{tsx,jsx,ts,js}"], {
      cwd: repo.path,
      gitignore: true,
    });
    for (const page of pages) {
      let content = readFileSafe(join(repo.path, page)) ?? "";
      const layoutContent = readFileSafe(
        join(repo.path, dirname(page), "layout.tsx"),
      );
      if (layoutContent) content += "\n" + layoutContent;

      const missing = missingAeoElements(content);
      if (missing.length > 0) {
        findings.push({
          checkId: "aeo-requirements",
          severity: "warning",
          message:
            `Page does not reference: ${missing.join(", ")} — verify AEO ` +
            `scaffolding (it may live in imported components).`,
          file: page,
        });
      }
    }
    return findings;
  },
};
