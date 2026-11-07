/**
 * middleware-asset-literals — an asset path written as a string literal in
 * middleware/proxy must be something the site actually serves.
 *
 * Origin incident (trucks-law + chicago-birth-injury-lawyers, 2026-11-07): a
 * fleet-wide middleware generator re-applied each site's old matcher
 * exclusions as literals — `p.startsWith("/favicon.ico")` — on sites that
 * ship `favicon.png`. The template lineage's `site-scope.test.ts` scans source
 * for asset paths and fails the deploy when one does not exist under
 * `public/` (it caught preloaded 403 heroes before), so the deploy job went
 * red before `sst deploy`. On a repo without that test the literal is dead
 * code: an exclusion that never matches.
 *
 * Served = a file under `public/<path>`, a Next metadata route in `app/` /
 * `src/app/` (`favicon.ico`, `icon.*`, `apple-icon.*`, `robots.*`,
 * `sitemap.*`, `manifest.*`, `opengraph-image.*`, `twitter-image.*`), or a
 * route handler / static file at the path itself. `/_next/*` and `/api/*`
 * are framework paths, never assets. Comments are stripped first: a docblock
 * that cites `/old/hero.png` is provenance, not a reference.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readFileSafe } from "../lib.js";
import { stripTsComments } from "../universal/fork-identity-consistency.js";
import type { Check, Finding } from "../../types.js";

const CHECK_ID = "middleware-asset-literals";

export const MIDDLEWARE_FILES = [
  "middleware.ts",
  "middleware.js",
  "src/middleware.ts",
  "src/middleware.js",
  "proxy.ts",
  "proxy.js",
  "src/proxy.ts",
  "src/proxy.js",
];

/** A quoted absolute path ending in a file name with an extension. */
const ASSET_LITERAL = /["'`](\/(?:[A-Za-z0-9_\-.@]+\/)*[A-Za-z0-9_\-@]+\.[A-Za-z0-9]{2,11})["'`]/g;
const FRAMEWORK_PREFIX = /^\/(?:_next|api)\//;

export interface AssetLiteral {
  path: string;
  line: number;
}

export function assetLiterals(source: string): AssetLiteral[] {
  const out: AssetLiteral[] = [];
  stripTsComments(source)
    .split(/\r?\n/)
    .forEach((line, idx) => {
      for (const m of line.matchAll(ASSET_LITERAL)) {
        if (FRAMEWORK_PREFIX.test(m[1])) continue;
        out.push({ path: m[1], line: idx + 1 });
      }
    });
  return out;
}

const METADATA_FILES: Record<string, string[]> = {
  "/favicon.ico": ["favicon.ico"],
  "/robots.txt": ["robots.ts", "robots.js", "robots.txt"],
  "/sitemap.xml": ["sitemap.ts", "sitemap.js", "sitemap.xml"],
  "/manifest.webmanifest": ["manifest.ts", "manifest.js", "manifest.json", "manifest.webmanifest"],
  "/manifest.json": ["manifest.ts", "manifest.js", "manifest.json", "manifest.webmanifest"],
};
const METADATA_IMAGE = /^\/(icon|apple-icon|opengraph-image|twitter-image)\d*\.[A-Za-z0-9]+$/;
const ROUTE_HANDLERS = ["route.ts", "route.js", "route.tsx"];

function entries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** True when something in the repo serves `path`. */
export function assetServed(repoPath: string, path: string): boolean {
  if (existsSync(join(repoPath, "public", path))) return true;
  const rel = path.replace(/^\//, "");
  for (const app of ["app", "src/app"]) {
    const dir = join(repoPath, app);
    if (!existsSync(dir)) continue;
    const fixed = METADATA_FILES[path];
    if (fixed && fixed.some((f) => existsSync(join(dir, f)))) return true;
    const img = METADATA_IMAGE.exec(path);
    if (img) {
      const stem = new RegExp(`^${img[1]}\\d*\\.`);
      if (entries(dir).some((f) => stem.test(f))) return true;
    }
    if (/^\/sitemap[/-][^/]+\.xml$/.test(path) && ["sitemap.ts", "sitemap.js"].some((f) => existsSync(join(dir, f)))) {
      return true;
    }
    if (existsSync(join(dir, rel))) return true;
    if (ROUTE_HANDLERS.some((r) => existsSync(join(dir, rel, r)))) return true;
  }
  return false;
}

export const middlewareAssetLiterals: Check = {
  id: CHECK_ID,
  title: "Asset paths named in middleware/proxy are served by the site",
  severity: "warning",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const file of MIDDLEWARE_FILES) {
      const src = readFileSafe(join(repo.path, file));
      if (src === null) continue;
      for (const lit of assetLiterals(src)) {
        if (assetServed(repo.path, lit.path)) continue;
        findings.push({
          checkId: CHECK_ID,
          severity: "warning",
          message:
            `names asset path "${lit.path}" but nothing serves it (no public${lit.path}, no ` +
            `metadata route or route handler) — a literal exclusion for a missing asset is dead ` +
            `code, and the template lineage's site-scope test fails the deploy on it (trucks-law + ` +
            `chicago-birth-injury-lawyers 2026-11-07); exclude by shape (\`p.includes(".")\`) or ` +
            `regex, or reference the file the site really ships`,
          file,
          line: lit.line,
          meta: { path: lit.path },
        });
      }
    }
    return findings;
  },
};
