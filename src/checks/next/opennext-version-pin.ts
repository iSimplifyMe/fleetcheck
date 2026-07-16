/**
 * opennext-version-pin — a Next.js 16+ site deployed through SST/OpenNext
 * must pin `openNextVersion` (>= 4.0.2) in sst.config.ts.
 *
 * Encodes the May 2026 incident: without the pin, an OpenNext default drift
 * made the image optimizer Lambda 500 on EVERY `/_next/image` request on
 * Next 16.2.x (`TypeError: s is not a function`) — broke CTAL + MMML in
 * production until 5/20 while local dev passed.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import * as semver from "semver";
import { readFileSafe } from "../lib.js";
import { resolvedNextFromLockfile } from "./next-cve.js";
import type { Check, Finding, RepoContext } from "../../types.js";

export const MIN_OPENNEXT = "4.0.2";

const OPENNEXT_VERSION = /openNextVersion\s*:\s*["'`]([^"'`]+)["'`]/;
const NEXTJS_COMPONENT = /Nextjs\s*\(/;

export interface OpenNextPinAssessment {
  status: "ok" | "missing" | "too-old" | "not-sst-nextjs" | "not-next16";
  pinned: string | null;
  detail: string;
}

/**
 * Assess an sst.config.ts body against the openNextVersion pin requirement.
 * @param effectiveNext  the repo's effective Next.js version (null = unknown)
 * @param sstConfig      sst.config.ts contents (null = file absent)
 */
export function assessOpenNextPin(
  effectiveNext: string | null,
  sstConfig: string | null,
): OpenNextPinAssessment {
  if (!effectiveNext || semver.major(effectiveNext) < 16) {
    return {
      status: "not-next16",
      pinned: null,
      detail: "The pin requirement applies to Next.js 16 and above.",
    };
  }
  if (!sstConfig || !NEXTJS_COMPONENT.test(sstConfig)) {
    return {
      status: "not-sst-nextjs",
      pinned: null,
      detail: "No sst.aws.Nextjs component — not deployed through SST/OpenNext.",
    };
  }

  const pinned = sstConfig.match(OPENNEXT_VERSION)?.[1] ?? null;
  if (!pinned) {
    return {
      status: "missing",
      pinned: null,
      detail:
        `Next ${effectiveNext} deploys through SST/OpenNext without an ` +
        `\`openNextVersion\` pin — an unpinned OpenNext 500'd every ` +
        `/_next/image on Next 16.2.x (\`TypeError: s is not a function\`; ` +
        `CTAL + MMML, May 2026). Pin \`openNextVersion: "${MIN_OPENNEXT}"\` ` +
        `(or later) in sst.config.ts.`,
    };
  }
  if (semver.valid(pinned) && semver.lt(pinned, MIN_OPENNEXT)) {
    return {
      status: "too-old",
      pinned,
      detail:
        `\`openNextVersion: "${pinned}"\` is below ${MIN_OPENNEXT} — the ` +
        `first OpenNext release safe for Next 16.2.x image optimization ` +
        `(/_next/image 500 incident, May 2026). Raise the pin to ` +
        `"${MIN_OPENNEXT}" or later.`,
    };
  }
  return {
    status: "ok",
    pinned,
    detail: `openNextVersion pinned to ${pinned}.`,
  };
}

function effectiveNextVersion(repo: RepoContext): string | null {
  const resolved = resolvedNextFromLockfile(repo.path);
  if (resolved) return resolved;
  const spec =
    repo.packageJson?.dependencies?.next ?? repo.packageJson?.devDependencies?.next;
  if (!spec) return null;
  if (semver.valid(spec)) return spec;
  try {
    return semver.minVersion(spec)?.version ?? null;
  } catch {
    return null;
  }
}

export const opennextVersionPin: Check = {
  id: "opennext-version-pin",
  title: `openNextVersion pinned (>= ${MIN_OPENNEXT}) for Next 16+ on SST`,
  severity: "error",
  appliesTo: (repo) => repo.hasNext && existsSync(join(repo.path, "sst.config.ts")),
  run(repo): Finding[] {
    const sstConfig = readFileSafe(join(repo.path, "sst.config.ts"));
    const a = assessOpenNextPin(effectiveNextVersion(repo), sstConfig);
    if (a.status !== "missing" && a.status !== "too-old") return [];

    let line: number | undefined;
    if (a.status === "too-old" && sstConfig) {
      const idx = sstConfig
        .split(/\r?\n/)
        .findIndex((l) => OPENNEXT_VERSION.test(l));
      if (idx >= 0) line = idx + 1;
    }
    return [
      {
        checkId: "opennext-version-pin",
        severity: "error",
        message: a.detail,
        file: "sst.config.ts",
        line,
        meta: { status: a.status, pinned: a.pinned, min: MIN_OPENNEXT },
      },
    ];
  },
};
