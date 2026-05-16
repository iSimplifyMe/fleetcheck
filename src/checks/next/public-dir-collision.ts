/**
 * public-dir-collision — a directory under public/ must not share a name with
 * a top-level app route. CloudFront's s3.routes then serves a 403 for the page.
 * Joe's rule: put assets in public/images/<route>/, never public/<route>/.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { globbySync } from "globby";
import type { Check, Finding } from "../../types.js";

/** First real URL segment of a route path (route groups dropped). null if root. */
export function firstUrlSegment(routePathRelToApp: string): string | null {
  const segs = routePathRelToApp
    .split("/")
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return segs.length > 0 ? segs[0] : null;
}

/** public/ dir names that collide with a route segment. */
export function publicRouteCollisions(
  publicDirs: string[],
  routeSegments: string[],
): string[] {
  const routes = new Set(routeSegments);
  return publicDirs.filter((d) => routes.has(d));
}

function publicSubdirs(repoPath: string): string[] {
  const pub = join(repoPath, "public");
  if (!existsSync(pub)) return [];
  try {
    return readdirSync(pub, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function routeSegments(repoPath: string): string[] {
  const pages = globbySync(["app/**/page.{tsx,jsx,ts,js}"], {
    cwd: repoPath,
    gitignore: true,
  });
  const segs = new Set<string>();
  for (const page of pages) {
    const mid = page.replace(/^app\//, "").replace(/\/?page\.[a-z]+$/, "");
    const seg = firstUrlSegment(mid);
    if (seg) segs.add(seg);
  }
  return [...segs];
}

export const publicDirCollision: Check = {
  id: "public-dir-collision",
  title: "public/ dirs do not collide with app routes",
  severity: "error",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const collisions = publicRouteCollisions(
      publicSubdirs(repo.path),
      routeSegments(repo.path),
    );
    return collisions.map((dir) => ({
      checkId: "public-dir-collision",
      severity: "error",
      message:
        `public/${dir}/ collides with the app route /${dir} — CloudFront s3.routes ` +
        `returns 403 for the page. Move assets to public/images/${dir}/.`,
      file: `public/${dir}`,
    }));
  },
};
