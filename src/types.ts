/** Core type contracts for fleetcheck. Every check and reporter depends on these. */

export type Severity = "security" | "error" | "warning" | "info";

/** Worst-first ordering. Lower index = more severe. */
export const SEVERITY_ORDER: Severity[] = ["security", "error", "warning", "info"];

export interface Finding {
  /** id of the check that produced this finding */
  checkId: string;
  severity: Severity;
  message: string;
  /** repo-relative file path, if the finding is file-specific */
  file?: string;
  /** 1-based line number, if known */
  line?: number;
  /** true if a safe auto-fixer exists for this finding */
  fixable?: boolean;
  /** optional machine-readable detail for fixers/reporters */
  meta?: Record<string, unknown>;
}

export type RepoKind = "next" | "other";

export interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface RepoContext {
  /** short name (the fleet.config.json key) */
  name: string;
  /** absolute local path to the repo working tree */
  path: string;
  kind: RepoKind;
  /** true when `next` is a declared dependency */
  hasNext: boolean;
  /** parsed package.json, if present */
  packageJson?: PackageJson;
  /** org/repo slug for gh operations, if known */
  slug?: string;
}

export interface Check {
  id: string;
  title: string;
  /** default/maximum severity this check emits */
  severity: Severity;
  /** whether this check runs against the given repo */
  appliesTo: (repo: RepoContext) => boolean;
  /** produce findings for the repo */
  run: (repo: RepoContext) => Promise<Finding[]> | Finding[];
}

export interface RepoResult {
  repo: string;
  kind: RepoKind;
  findings: Finding[];
  /** checks that threw, keyed by check id -> error message */
  errors: Record<string, string>;
  /** wall time in ms */
  durationMs: number;
}

export interface ScanResult {
  generatedAt: string;
  repos: RepoResult[];
}
