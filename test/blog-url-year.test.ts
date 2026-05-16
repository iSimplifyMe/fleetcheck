import { describe, it, expect } from "vitest";
import { yearSegmentsInBlogPaths, blogUrlYear } from "../src/checks/next/blog-url-year.js";
import { fixtureCtx } from "./helpers.js";

describe("yearSegmentsInBlogPaths", () => {
  it("flags a year directory under a blog path", () => {
    const hits = yearSegmentsInBlogPaths(["app/blog/2024", "app/blog/2024/post"]);
    expect(hits).toContain("app/blog/2024");
  });

  it("ignores year-like dirs outside blog paths and non-year blog dirs", () => {
    const hits = yearSegmentsInBlogPaths(["app/blog/hello-world", "app/case-studies/2024"]);
    expect(hits).toEqual([]);
  });
});

describe("blog-url-year check", () => {
  it("flags a blog route with a year segment", async () => {
    const findings = await blogUrlYear.run(fixtureCtx("next-blog-year", "next"));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].checkId).toBe("blog-url-year");
    expect(findings[0].severity).toBe("warning");
  });

  it("passes a blog route with no year segment", async () => {
    const findings = await blogUrlYear.run(fixtureCtx("next-blog-clean", "next"));
    expect(findings).toHaveLength(0);
  });
});
