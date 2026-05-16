/**
 * blog-schema-spokes — BlogPosting/Article JSON-LD must appear only on blog
 * routes. The content pipeline has repeatedly emitted blog schema onto spoke
 * (service) pages, which should carry Service/page-type schema instead.
 */

import { join } from "node:path";
import { globbySync } from "globby";
import { readFileSafe } from "../lib.js";
import type { Check, Finding } from "../../types.js";

const ARTICLE_SCHEMA = /"@type"\s*:\s*"(BlogPosting|Article|NewsArticle)"/;
const BLOG_SEGMENTS = ["blog", "insights", "articles", "news", "posts"];

export function hasArticleSchema(content: string): boolean {
  return ARTICLE_SCHEMA.test(content);
}

function isBlogRoute(routePathRelToApp: string): boolean {
  const segs = routePathRelToApp.toLowerCase().split("/").filter(Boolean);
  return segs.some((s) => BLOG_SEGMENTS.includes(s));
}

export const blogSchemaSpokes: Check = {
  id: "blog-schema-spokes",
  title: "Article schema only on blog routes",
  severity: "warning",
  appliesTo: (repo) => repo.hasNext,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    const pages = globbySync(["app/**/page.{tsx,jsx,ts,js}"], {
      cwd: repo.path,
      gitignore: true,
    });
    for (const page of pages) {
      const content = readFileSafe(join(repo.path, page));
      if (!content) continue;
      if (!hasArticleSchema(content)) continue;
      const mid = page.replace(/^app\//, "").replace(/\/?page\.[a-z]+$/, "");
      if (isBlogRoute(mid)) continue;
      findings.push({
        checkId: "blog-schema-spokes",
        severity: "warning",
        message:
          "Page emits BlogPosting/Article JSON-LD but is not a blog route — spoke " +
          "pages should carry Service / page-type schema, not blog schema.",
        file: page,
      });
    }
    return findings;
  },
};
