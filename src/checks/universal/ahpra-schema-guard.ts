/**
 * ahpra-schema-guard — AHPRA s133: never ADD review/testimonial or
 * `Review`/`AggregateRating` schema to AU-registered health sites.
 *
 * Advertising a regulated health service with reviews/testimonials breaches
 * National Law s133 — the consequence is legal exposure for the client, and
 * there is zero technical signal when it happens. Existing, client-approved
 * occurrences stay (per Joe); the guard pins their count as a baseline and
 * fails only when NEW occurrences appear.
 *
 * Scoped to an explicit repo list plus any repo that opts in by configuring
 * a baseline (fleet.config.json entry `settings` or a repo-local
 * `.fleetcheckrc.json`):
 *
 *   { "ahpra-schema-guard": { "baseline": 1 } }
 */

import { join } from "node:path";
import { sourceFiles, readFileSafe } from "../lib.js";
import type { Check, Finding, RepoContext } from "../../types.js";

/** AU medical repos under AHPRA advertising rules. */
export const AHPRA_REPOS = ["signature-dentistry", "precision-health-i18n"];

/** Review/rating schema markers, counted as total occurrences. */
const SCHEMA_PATTERNS: RegExp[] = [
  /AggregateRating/g,
  /["']@type["']\s*:\s*["']Review["']/g,
];

/** Shipped site source only — not docs, scripts, or reports. */
const SCHEMA_GLOBS = [
  "src/**/*.{ts,tsx,js,jsx,md,mdx,json}",
  "app/**/*.{ts,tsx,js,jsx,md,mdx,json}",
  "components/**/*.{ts,tsx,js,jsx}",
  "content/**/*.{md,mdx,json}",
];

interface AhpraSettings {
  baseline?: number;
}

function settingsFor(repo: RepoContext): AhpraSettings | undefined {
  const s = repo.settings?.["ahpra-schema-guard"];
  return s && typeof s === "object" ? (s as AhpraSettings) : undefined;
}

/** Total occurrences of review/rating schema markers in a file body. */
export function countSchemaOccurrences(content: string): number {
  let count = 0;
  for (const rx of SCHEMA_PATTERNS) {
    count += content.match(rx)?.length ?? 0;
  }
  return count;
}

export const ahpraSchemaGuard: Check = {
  id: "ahpra-schema-guard",
  title: "AHPRA s133 — no new Review/AggregateRating schema on AU medical sites",
  severity: "security",
  appliesTo: (repo) =>
    AHPRA_REPOS.includes(repo.name) || settingsFor(repo) !== undefined,
  run(repo): Finding[] {
    const perFile: Record<string, number> = {};
    let count = 0;
    for (const rel of sourceFiles(repo.path, SCHEMA_GLOBS)) {
      const content = readFileSafe(join(repo.path, rel));
      if (!content) continue;
      const n = countSchemaOccurrences(content);
      if (n > 0) {
        perFile[rel] = n;
        count += n;
      }
    }

    const settings = settingsFor(repo);
    const baseline = typeof settings?.baseline === "number" ? settings.baseline : 0;
    if (count === baseline) return [];

    const where = Object.entries(perFile)
      .map(([f, n]) => `${f} (${n})`)
      .join(", ");

    if (count < baseline) {
      return [
        {
          checkId: "ahpra-schema-guard",
          severity: "info",
          message:
            `Review/AggregateRating schema count (${count}) is below the ` +
            `pinned baseline (${baseline}) — occurrences were removed. ` +
            `Re-pin the baseline to ${count} so future additions still fail.`,
          meta: { count, baseline, files: perFile },
        },
      ];
    }

    const pinHint =
      settings === undefined
        ? " If every occurrence is pre-existing and client-approved, pin the " +
          `baseline: \`.fleetcheckrc.json\` → ` +
          `{"ahpra-schema-guard":{"baseline":${count}}}.`
        : "";
    return [
      {
        checkId: "ahpra-schema-guard",
        severity: "security",
        message:
          `AHPRA s133 — no new review/rating schema on AU medical sites: found ` +
          `${count} Review/AggregateRating schema occurrence(s); the pinned ` +
          `baseline is ${baseline}. New review or rating markup on an ` +
          `AU-registered practitioner site risks National Law s133 exposure — ` +
          `remove the addition (existing baselined occurrences stay).` +
          (where ? ` Occurrences: ${where}.` : "") +
          pinHint,
        meta: { count, baseline, files: perFile },
      },
    ];
  },
};
