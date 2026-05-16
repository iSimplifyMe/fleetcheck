/** Fleet config loading and per-repo classification. */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PackageJson, RepoContext, RepoKind } from "./types.js";

export interface FleetRepoEntry {
  name: string;
  /** local working-tree path (absolute or ~-relative-resolved by caller) */
  path: string;
  /** org/repo slug for gh operations */
  slug?: string;
  /** skip this repo entirely */
  skip?: boolean;
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

/** Build a RepoContext from a fleet config entry. */
export function classifyRepo(entry: FleetRepoEntry): RepoContext {
  const path = resolve(entry.path);
  const pkg = loadPackageJson(path);
  const hasNext = hasDependency(pkg, "next");
  const kind: RepoKind = hasNext ? "next" : "other";
  return { name: entry.name, path, kind, hasNext, packageJson: pkg, slug: entry.slug };
}

export function loadFleetConfig(configPath: string): FleetConfig {
  const raw = JSON.parse(readFileSync(resolve(configPath), "utf8")) as FleetConfig;
  if (!Array.isArray(raw.repos)) {
    throw new Error("fleet config: `repos` must be an array");
  }
  return raw;
}
