/**
 * blog-url-year — blog route URLs must not contain year tokens. Year segments
 * age the content and force redirects when posts are refreshed.
 */

import { directories, BLOG_SEGMENTS } from "../lib.js";
import type { Check, Finding } from "../../types.js";

const YEAR = /^20\d\d$/;

/** Directory paths whose last segment is a year under a blog-ish ancestor. */
export function yearSegmentsInBlogPaths(dirRelPaths: string[]): string[] {
  const hits: string[] = [];
  for (const dir of dirRelPaths) {
    const segs = dir.split("/").filter(Boolean);
    if (segs.length === 0) continue;
    const last = segs[segs.length - 1];
    if (!YEAR.test(last)) continue;
    const ancestors = segs.slice(0, -1);
    if (ancestors.some((s) => BLOG_SEGMENTS.includes(s.toLowerCase()))) {
      hits.push(dir);
    }
  }
  return hits;
}

export const blogUrlYear: Check = {
  id: "blog-url-year",
  title: "No year tokens in blog route URLs",
  severity: "warning",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    return yearSegmentsInBlogPaths(directories(repo.path)).map((dir) => ({
      checkId: "blog-url-year",
      severity: "warning",
      message:
        `Blog route \`${dir}\` contains a year segment — year tokens in blog ` +
        `URLs age the content and force redirects later. Use a year-free slug.`,
      file: dir,
    }));
  },
};
