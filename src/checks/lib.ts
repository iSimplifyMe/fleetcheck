/** Shared helpers for checks: source-file discovery and line matching. */

import { globbySync } from "globby";
import { readFileSync } from "node:fs";

const SOURCE_GLOBS = ["**/*.{ts,tsx,js,jsx,mjs,cjs}"];

const SOURCE_IGNORE = [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/.sst/**",
];

/** Relative paths of source files in the repo (gitignore-aware). */
export function sourceFiles(repoPath: string, globs: string[] = SOURCE_GLOBS): string[] {
  return globbySync(globs, {
    cwd: repoPath,
    gitignore: true,
    ignore: SOURCE_IGNORE,
    onlyFiles: true,
  });
}

/** Relative paths of directories in the repo (gitignore-aware). */
export function directories(repoPath: string): string[] {
  return globbySync(["**"], {
    cwd: repoPath,
    gitignore: true,
    ignore: SOURCE_IGNORE,
    onlyDirectories: true,
  });
}

export function readFileSafe(absPath: string): string | null {
  try {
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

/** Lines (1-based) where a non-global regex matches. */
export function matchingLines(
  content: string,
  regex: RegExp,
): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) out.push({ line: i + 1, text: lines[i] });
  }
  return out;
}
