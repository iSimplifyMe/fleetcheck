import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assetLiterals,
  assetServed,
  middlewareAssetLiterals,
} from "../src/checks/next/middleware-asset-literals.js";
import { classifyRepo } from "../src/fleet.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("assetLiterals", () => {
  it("extracts quoted absolute file paths, skipping framework paths and comments", () => {
    const lits = assetLiterals(
      '// see /old/hero.png\nconst a = p.startsWith("/favicon.ico") || p === "/images/hero.jpg" || p === "/_next/static/x.js" || p === "/api/x.json" || p === `/site.webmanifest`;',
    );
    expect(lits.map((l) => l.path)).toEqual(["/favicon.ico", "/images/hero.jpg", "/site.webmanifest"]);
    expect(lits[0].line).toBe(2);
  });
  it("ignores paths without a file extension and template interpolations", () => {
    expect(assetLiterals('const a = "/images/" + x; const b = `/images/${x}.jpg`; const c = "/about";')).toEqual([]);
  });
});

describe("assetServed", () => {
  const clean = resolve(fixtures, "mw-literal-clean");
  it("recognizes public files, metadata routes and route handlers", () => {
    for (const p of ["/favicon.ico", "/site.webmanifest", "/robots.txt", "/sitemap.xml", "/icon.png", "/feed.xml"]) {
      expect(assetServed(clean, p), p).toBe(true);
    }
  });
  it("rejects what nothing serves", () => {
    expect(assetServed(clean, "/favicon.png")).toBe(false);
    expect(assetServed(resolve(fixtures, "mw-literal-dirty"), "/favicon.ico")).toBe(false);
  });
});

describe("middleware-asset-literals check", () => {
  it("fires on the incident literal and a missing image, not on the api path", async () => {
    const findings = await middlewareAssetLiterals.run(classifyRepo({ name: "mw-literal-dirty" }, fixtures));
    expect(findings.map((f) => f.meta?.path)).toEqual(["/favicon.ico", "/images/hero.jpg"]);
    expect(findings[0].file).toBe("src/middleware.ts");
    expect(findings[0].line).toBe(6);
    expect(findings[0].severity).toBe("warning");
  });
  it("stays silent when every literal is served", async () => {
    expect(await middlewareAssetLiterals.run(classifyRepo({ name: "mw-literal-clean" }, fixtures))).toEqual([]);
  });
  it("applies only to Next repos", () => {
    expect(middlewareAssetLiterals.appliesTo(classifyRepo({ name: "secret-clean" }, fixtures))).toBe(false);
    expect(middlewareAssetLiterals.appliesTo(classifyRepo({ name: "mw-literal-clean" }, fixtures))).toBe(true);
  });
});
