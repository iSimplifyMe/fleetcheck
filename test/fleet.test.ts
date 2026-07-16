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

  it("resolves a relative entry path under root", () => {
    const ctx = classifyRepo({ name: "anitapatelmd", path: "wt-present" }, fixtures);
    expect(ctx.path).toBe(resolve(fixtures, "wt-present"));
  });

  it("merges fleet-entry settings under a repo-local .fleetcheckrc.json (repo file wins)", () => {
    const ctx = classifyRepo(
      {
        name: "ahpra-over-baseline",
        settings: { "ahpra-schema-guard": { baseline: 99 }, "other-check": { on: true } },
      },
      fixtures,
    );
    // .fleetcheckrc.json in the fixture pins baseline: 1 — it wins.
    expect(ctx.settings?.["ahpra-schema-guard"]).toEqual({ baseline: 1 });
    expect(ctx.settings?.["other-check"]).toEqual({ on: true });
  });

  it("leaves settings undefined when neither source provides any", () => {
    const ctx = classifyRepo({ name: "wt-missing" }, fixtures);
    expect(ctx.settings).toBeUndefined();
  });
});
