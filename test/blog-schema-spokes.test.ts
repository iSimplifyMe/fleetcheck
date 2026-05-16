import { describe, it, expect } from "vitest";
import {
  hasArticleSchema,
  blogSchemaSpokes,
} from "../src/checks/next/blog-schema-spokes.js";
import { fixtureCtx } from "./helpers.js";

describe("hasArticleSchema", () => {
  it("detects BlogPosting / Article JSON-LD types", () => {
    expect(hasArticleSchema('{"@type": "BlogPosting"}')).toBe(true);
    expect(hasArticleSchema('{"@type":"Article"}')).toBe(true);
  });

  it("ignores other schema types", () => {
    expect(hasArticleSchema('{"@type": "Service"}')).toBe(false);
  });
});

describe("blog-schema-spokes check", () => {
  it("flags Article schema on a non-blog route", async () => {
    const findings = await blogSchemaSpokes.run(fixtureCtx("next-spoke-bad", "next"));
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("blog-schema-spokes");
    expect(findings[0].severity).toBe("warning");
  });

  it("allows Article schema on a real blog route", async () => {
    const findings = await blogSchemaSpokes.run(fixtureCtx("next-spoke-ok", "next"));
    expect(findings).toHaveLength(0);
  });

  it("detects spoke schema under a src/app/ tree", async () => {
    const findings = await blogSchemaSpokes.run(fixtureCtx("next-srcapp-spoke", "next"));
    expect(findings).toHaveLength(1);
  });
});
