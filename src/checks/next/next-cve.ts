/**
 * next-cve — flag repos whose Next.js version is exposed to CVE-2026-44578
 * (SSRF, CVSS 8.6; patched in 16.2.5).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as semver from "semver";
import type { Check, Finding, RepoContext } from "../../types.js";

export const PATCHED = "16.2.5";
const CVE = "CVE-2026-44578";

export interface NextCveAssessment {
  status: "patched" | "vulnerable" | "uncertain" | "unknown";
  effectiveVersion: string | null;
  basis: "resolved" | "range" | "none";
  fixable: boolean;
  detail: string;
}

/**
 * Assess a Next.js dependency against CVE-2026-44578.
 * @param spec      declared version/range from package.json
 * @param resolved  resolved version from a lockfile, when known
 */
export function assessNextCve(spec: string, resolved?: string): NextCveAssessment {
  // A definite version: an explicit lockfile resolution, or an exact pin.
  const pinned = semver.valid(spec);
  const definite = resolved ?? pinned ?? null;

  if (definite) {
    if (semver.gte(definite, PATCHED)) {
      return {
        status: "patched",
        effectiveVersion: definite,
        basis: "resolved",
        fixable: false,
        detail: `Next ${definite} is at or above the ${PATCHED} patch.`,
      };
    }
    const major = semver.major(definite);
    return {
      status: "vulnerable",
      effectiveVersion: definite,
      basis: "resolved",
      fixable: major === 16,
      detail:
        major === 16
          ? `Next ${definite} is exposed to ${CVE}; bump to ^${PATCHED}.`
          : `Next ${definite} (major ${major}) is exposed to ${CVE}; the patched ` +
            `version differs by release branch — verify against the advisory.`,
    };
  }

  // Range only: judge by the floor the range permits.
  let floor: semver.SemVer | null = null;
  try {
    floor = semver.minVersion(spec);
  } catch {
    floor = null;
  }
  if (!floor) {
    return {
      status: "unknown",
      effectiveVersion: null,
      basis: "none",
      fixable: false,
      detail: `Could not resolve a Next version from \`${spec}\`.`,
    };
  }
  if (semver.gte(floor.version, PATCHED)) {
    return {
      status: "patched",
      effectiveVersion: floor.version,
      basis: "range",
      fixable: false,
      detail: `Declared range \`${spec}\` only permits versions at or above ${PATCHED}.`,
    };
  }
  return {
    status: "uncertain",
    effectiveVersion: floor.version,
    basis: "range",
    fixable: semver.major(floor.version) === 16,
    detail:
      `Declared range \`${spec}\` permits versions below the ${PATCHED} patch for ` +
      `${CVE}; no lockfile resolution available — verify the installed version.`,
  };
}

/** Resolve the `next` version from a pnpm-lock.yaml body (the `next@x.y.z` key). */
export function parseNextFromPnpmLock(text: string): string | undefined {
  return text.match(/^\s+next@(\d+\.\d+\.\d+)[:(]/m)?.[1];
}

/** Read the resolved `next` version from a lockfile (npm or pnpm), if present. */
export function resolvedNextFromLockfile(repoPath: string): string | undefined {
  const npmLock = join(repoPath, "package-lock.json");
  if (existsSync(npmLock)) {
    try {
      const lock = JSON.parse(readFileSync(npmLock, "utf8")) as {
        packages?: Record<string, { version?: string }>;
      };
      const version = lock.packages?.["node_modules/next"]?.version;
      if (version) return version;
    } catch {
      /* fall through to other lockfiles */
    }
  }
  const pnpmLock = join(repoPath, "pnpm-lock.yaml");
  if (existsSync(pnpmLock)) {
    try {
      return parseNextFromPnpmLock(readFileSync(pnpmLock, "utf8"));
    } catch {
      /* no resolution available */
    }
  }
  return undefined;
}

function declaredNext(repo: RepoContext): string | undefined {
  const pkg = repo.packageJson;
  return pkg?.dependencies?.next ?? pkg?.devDependencies?.next;
}

export const nextCve: Check = {
  id: "next-cve",
  title: `Next.js patched against ${CVE}`,
  severity: "security",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const spec = declaredNext(repo);
    if (!spec) return [];
    const resolved = resolvedNextFromLockfile(repo.path);
    const a = assessNextCve(spec, resolved);
    if (a.status === "patched") return [];

    const severity =
      a.status === "vulnerable"
        ? "security"
        : a.status === "uncertain"
          ? "warning"
          : "info";
    return [
      {
        checkId: "next-cve",
        severity,
        message: a.detail,
        file: "package.json",
        fixable: a.fixable,
        meta: {
          cve: CVE,
          status: a.status,
          effectiveVersion: a.effectiveVersion,
          declared: spec,
          patched: PATCHED,
          basis: a.basis,
        },
      },
    ];
  },
};
