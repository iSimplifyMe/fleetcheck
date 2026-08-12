/**
 * authed-cache-leak — a gated (auth-protected) page that can render static or
 * shared-cacheable leaks authed data through a cookie-blind CDN.
 *
 * Incident (VB portal, 2026-08-11): pages under the middleware-gated
 * `(portal)` group had no `force-dynamic`, so an authenticated render carried
 * `s-maxage=31536000`; `/property/[file]` additionally declared
 * `generateStaticParams`, baking real client data into static HTML at build.
 * The CloudFront cache policy (`CookieBehavior: none` — the SST/OpenNext
 * default on every fleet distribution) keeps ONE copy per path regardless of
 * who asked, and a cache HIT never reaches the origin, so the middleware gate
 * never ran on cached content. The first authed load after any cache-clear
 * filled the shared cache; every later visitor — signed in or not — was served
 * it. Fleet audit:
 * ~/claude/projects/fleetcheck/authed-cache-leak-fleet-audit-2026-08-11.md
 *
 * Two layers:
 *  - security: a static-render marker (`generateStaticParams`,
 *    `revalidate > 0`, `force-static`) on a page or layout inside a gated
 *    tree. `force-dynamic` does NOT neutralize `generateStaticParams` — the
 *    generator wins and the route still prebuilds (measured in the incident) —
 *    so this fires even when both are present.
 *  - warning: in a middleware-gated repo, a non-public page whose tree has no
 *    dynamic proof (no `force-dynamic`, no server session read). Its authed
 *    render may emit `s-maxage` and be CDN-cached for strangers.
 *
 * Gate shapes recognized (shape-based, never path-blind):
 *  - middleware-gated: the middleware reads request cookies AND denies
 *    (redirects to a login/sign-in path, or answers 401/403).
 *  - component-gated: a layout or page calls a server session reader
 *    (`requireAuth(` / `getServerSession(` / `await auth(` / `cookies()`).
 *    The session read makes the render implicitly dynamic — that IS the
 *    dynamic proof, so only the static-marker layer applies to these trees.
 *  - a middleware that stamps `no-store` Cache-Control without cookie-gating
 *    (client-side-auth apps, e.g. nexus-app) is runtime-protected: the
 *    warning layer stays silent for it.
 *
 * Public segments (login, sign-in, `(public)`, `(marketing)`, share, …) are
 * exempt. Extend per repo via settings:
 *   { "authed-cache-leak": { "publicRoutes": ["client-portal", "preview"] } }
 */

import { join, dirname } from "node:path";
import { globbySync } from "globby";
import { readFileSafe, appPageFiles, routePath, matchingLines } from "../lib.js";
import type { Check, Finding, RepoContext } from "../../types.js";

const CHECK_ID = "authed-cache-leak";

const MIDDLEWARE_CANDIDATES = [
  "middleware.ts",
  "middleware.js",
  "src/middleware.ts",
  "src/middleware.js",
];

/** Middleware reads a request cookie (the gate's session lookup). */
const MW_COOKIE_READ = /(request|req)\s*\.\s*cookies|getToken\s*\(/;
/** Middleware denies: login redirect or 401/403 response. */
const MW_LOGIN_PATH = /["'`][^"'`]*(login|sign-?in)[^"'`]*["'`]/i;
const MW_REDIRECT = /\.redirect\s*\(|NextResponse\.redirect/;
const MW_DENY_STATUS = /status\s*:\s*40[13]\b|,\s*40[13]\s*\)|new Response\s*\([^)]*40[13]/;
/** Middleware stamps no-store itself (client-side-auth apps). */
const MW_NO_STORE = /no-store/;
const MW_SETS_CACHE_CONTROL = /set\s*\(\s*["'`]cache-control["'`]/i;

/** Server session readers — their presence makes a render implicitly dynamic. */
const SESSION_READ =
  /requireAuth\s*\(|requireAdmin\s*\(|getServerSession\s*\(|await\s+auth\s*\(|from\s+["']next-auth|\bcookies\s*\(\s*\)/;

const FORCE_DYNAMIC = /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/;
/** A page that only redirects renders no data — nothing cacheable to leak. */
const REDIRECT_CALL = /\bredirect\s*\(/;
const JSX_MARKUP = /<[A-Za-z]/;
const FORCE_STATIC = /export\s+const\s+dynamic\s*=\s*["']force-static["']/;
const GENERATOR =
  /export\s+(async\s+)?function\s+generateStaticParams\b|export\s+const\s+generateStaticParams\b/;
const REVALIDATE = /export\s+const\s+revalidate\s*=\s*(\d+)/;

const DEFAULT_PUBLIC_SEGMENTS = [
  "login",
  "logout",
  "sign-in",
  "signin",
  "sign-up",
  "signup",
  "register",
  "forgot-password",
  "reset-password",
  "share",
  "auth",
  "(auth)",
  "(public)",
  "(marketing)",
  "_not-found",
];

interface LayoutInfo {
  /** repo-relative dir containing the layout (e.g. "app/(portal)") */
  dir: string;
  forceDynamic: boolean;
  sessionRead: boolean;
  content: string;
  rel: string;
}

interface RcSettings {
  publicRoutes?: string[];
}

function settingsFor(repo: RepoContext): RcSettings {
  const s = repo.settings?.[CHECK_ID];
  return s && typeof s === "object" ? (s as RcSettings) : {};
}

function layoutFiles(repoPath: string): string[] {
  return globbySync(
    ["app/**/layout.{tsx,jsx,ts,js}", "src/app/**/layout.{tsx,jsx,ts,js}"],
    {
      cwd: repoPath,
      gitignore: true,
      ignore: ["**/node_modules/**", "**/.next/**", "**/.worktrees/**", "**/dist/**"],
    },
  );
}

function segmentsOf(rel: string): string[] {
  return routePath(rel).split("/").filter(Boolean);
}

function isPublicRoute(rel: string, publicSegments: Set<string>): boolean {
  return segmentsOf(rel).some((seg) => publicSegments.has(seg));
}

/** revalidate > 0 means ISR (shared-cacheable); revalidate = 0 forces dynamic. */
function revalidateSeconds(content: string): number | null {
  const m = REVALIDATE.exec(content);
  return m ? Number.parseInt(m[1], 10) : null;
}

function ancestorsOf(fileRel: string, layouts: LayoutInfo[]): LayoutInfo[] {
  const dir = dirname(fileRel);
  return layouts.filter((l) => dir === l.dir || dir.startsWith(l.dir + "/"));
}

/** Static-render markers on a page/layout inside a gated tree → security. */
function staticMarkerFindings(
  rel: string,
  content: string,
  hasForceDynamic: boolean,
): Finding[] {
  const findings: Finding[] = [];
  if (GENERATOR.test(content)) {
    const line = matchingLines(content, GENERATOR)[0]?.line;
    findings.push({
      checkId: CHECK_ID,
      severity: "security",
      message:
        "`generateStaticParams` on a gated route — real data is baked into static HTML at " +
        "build and served from the CDN without the auth gate ever running" +
        (hasForceDynamic
          ? " (`force-dynamic` does NOT stop this — the generator wins and the route still prebuilds)"
          : "") +
        ". Remove the generator from gated routes (VB portal incident, 2026-08-11).",
      file: rel,
      line,
    });
  }
  if (FORCE_STATIC.test(content)) {
    const line = matchingLines(content, FORCE_STATIC)[0]?.line;
    findings.push({
      checkId: CHECK_ID,
      severity: "security",
      message:
        "`dynamic = 'force-static'` on a gated route — the authed render becomes a shared " +
        "static object a cookie-blind CDN serves to anyone.",
      file: rel,
      line,
    });
  }
  const reval = revalidateSeconds(content);
  if (reval !== null && reval > 0) {
    const line = matchingLines(content, REVALIDATE)[0]?.line;
    findings.push({
      checkId: CHECK_ID,
      severity: "security",
      message:
        `\`revalidate = ${reval}\` on a gated route — ISR makes the authed render ` +
        "shared-cacheable; every visitor gets the same copy until it expires.",
      file: rel,
      line,
    });
  }
  return findings;
}

export const authedCacheLeak: Check = {
  id: CHECK_ID,
  title: "Gated pages must not be static/shared-cacheable (CDN cache leak)",
  severity: "security",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];

    // --- classify the repo's gate shape ---
    let middlewareGated = false;
    let noStoreStamping = false;
    for (const cand of MIDDLEWARE_CANDIDATES) {
      const content = readFileSafe(join(repo.path, cand));
      if (!content) continue;
      const denies =
        (MW_REDIRECT.test(content) && MW_LOGIN_PATH.test(content)) ||
        MW_DENY_STATUS.test(content);
      middlewareGated = MW_COOKIE_READ.test(content) && denies;
      noStoreStamping = MW_NO_STORE.test(content) && MW_SETS_CACHE_CONTROL.test(content);
      break;
    }

    const layouts: LayoutInfo[] = layoutFiles(repo.path).map((rel) => {
      const content = readFileSafe(join(repo.path, rel)) ?? "";
      return {
        rel,
        dir: dirname(rel),
        content,
        forceDynamic: FORCE_DYNAMIC.test(content),
        sessionRead: SESSION_READ.test(content),
      };
    });

    const publicSegments = new Set([
      ...DEFAULT_PUBLIC_SEGMENTS,
      ...(settingsFor(repo).publicRoutes ?? []),
    ]);

    // --- layouts: static markers on a gated layout cover the whole subtree ---
    for (const l of layouts) {
      if (isPublicRoute(l.rel, publicSegments)) continue;
      const gated = middlewareGated
        ? true
        : l.sessionRead || ancestorsOf(l.rel, layouts).some((a) => a.sessionRead);
      if (!gated) continue;
      findings.push(...staticMarkerFindings(l.rel, l.content, l.forceDynamic));
    }

    // --- pages ---
    for (const rel of appPageFiles(repo.path)) {
      if (isPublicRoute(rel, publicSegments)) continue;
      const content = readFileSafe(join(repo.path, rel));
      if (!content) continue;

      const ancestors = ancestorsOf(rel, layouts);
      const pageSessionRead = SESSION_READ.test(content);
      const treeSessionRead = pageSessionRead || ancestors.some((a) => a.sessionRead);
      const gated = middlewareGated ? true : treeSessionRead;
      if (!gated) continue;

      const pageForceDynamic = FORCE_DYNAMIC.test(content);
      const markerFindings = staticMarkerFindings(rel, content, pageForceDynamic);
      findings.push(...markerFindings);
      if (markerFindings.length > 0) continue;

      // Warning layer: middleware-gated only — the gate runs at the origin and
      // never covers a CDN hit; without a dynamic proof the render may emit
      // s-maxage. Component-gated trees are implicitly dynamic (session read).
      if (!middlewareGated || noStoreStamping) continue;
      const reval = revalidateSeconds(content);
      const bareRedirect = REDIRECT_CALL.test(content) && !JSX_MARKUP.test(content);
      const dynamicProven =
        pageForceDynamic ||
        treeSessionRead ||
        reval === 0 ||
        bareRedirect ||
        ancestors.some((a) => a.forceDynamic);
      if (!dynamicProven) {
        findings.push({
          checkId: CHECK_ID,
          severity: "warning",
          message:
            "Middleware-gated page with no dynamic proof (`force-dynamic` on the page or a " +
            "parent layout, or a server session read). Its authed render may emit " +
            "`s-maxage` and be CDN-cached for unauthenticated visitors — the middleware " +
            "gate never runs on a cache hit. Add `export const dynamic = 'force-dynamic'` " +
            "to the gated layout.",
          file: rel,
        });
      }
    }

    return findings;
  },
};
