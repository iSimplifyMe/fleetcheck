/** Fleet config loading and per-repo classification. */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PackageJson, RepoContext, RepoKind } from "./types.js";

export interface FleetRepoEntry {
  name: string;
  /** org/repo slug for gh operations */
  slug?: string;
  /** skip this repo entirely */
  skip?: boolean;
  /** explicit working-tree path (relative paths resolve under --root); defaults to <root>/<name> */
  path?: string;
  /** per-repo check settings, keyed by check id (e.g. ahpra-schema-guard) */
  settings?: Record<string, unknown>;
}

export interface FleetConfig {
  repos: FleetRepoEntry[];
}

export function loadPackageJson(repoPath: string): PackageJson | undefined {
  const p = join(repoPath, "package.json");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

export function hasDependency(pkg: PackageJson | undefined, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

/**
 * Per-repo settings from a `.fleetcheckrc.json` at the repo root, if present.
 * Shape: `{ "<check-id>": { …check-specific options } }`.
 */
export function loadRepoSettings(repoPath: string): Record<string, unknown> | undefined {
  const p = join(repoPath, ".fleetcheckrc.json");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Build a RepoContext from a fleet config entry, resolving its path under root. */
export function classifyRepo(entry: FleetRepoEntry, root: string): RepoContext {
  // A relative entry.path anchors at root (absolute paths win, per resolve()).
  const path = entry.path ? resolve(root, entry.path) : resolve(root, entry.name);
  const pkg = loadPackageJson(path);
  const hasNext = hasDependency(pkg, "next");
  const kind: RepoKind = hasNext ? "next" : "other";
  // The repo's own .fleetcheckrc.json wins over the fleet config entry.
  const settings = { ...(entry.settings ?? {}), ...(loadRepoSettings(path) ?? {}) };
  return {
    name: entry.name,
    path,
    kind,
    hasNext,
    packageJson: pkg,
    slug: entry.slug,
    settings: Object.keys(settings).length > 0 ? settings : undefined,
  };
}

export function loadFleetConfig(configPath: string): FleetConfig {
  const raw = JSON.parse(readFileSync(resolve(configPath), "utf8")) as FleetConfig;
  if (!Array.isArray(raw.repos)) {
    throw new Error("fleet config: `repos` must be an array");
  }
  return raw;
}
