import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hasDependency, classifyRepo } from "../src/fleet.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("hasDependency", () => {
  it("finds a dep in dependencies or devDependencies", () => {
    expect(hasDependency({ dependencies: { next: "16.2.5" } }, "next")).toBe(true);
    expect(hasDependency({ devDependencies: { vitest: "2" } }, "vitest")).toBe(true);
    expect(hasDependency({ dependencies: {} }, "next")).toBe(false);
    expect(hasDependency(undefined, "next")).toBe(false);
  });
});

describe("classifyRepo", () => {
  it("resolves the path under root and detects a Next repo", () => {
    const ctx = classifyRepo({ name: "next-edge-og" }, fixtures);
    expect(ctx.path).toBe(resolve(fixtures, "next-edge-og"));
    expect(ctx.kind).toBe("next");
    expect(ctx.hasNext).toBe(true);
  });

  it("classifies a repo without a Next dependency as other", () => {
    const ctx = classifyRepo({ name: "wt-missing" }, fixtures);
    expect(ctx.kind).toBe("other");
    expect(ctx.hasNext).toBe(false);
  });
});
