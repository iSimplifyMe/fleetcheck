import { describe, it, expect } from "vitest";
import {
  publicRouteCollisions,
  firstUrlSegment,
  publicDirCollision,
} from "../src/checks/next/public-dir-collision.js";
import { fixtureCtx } from "./helpers.js";

describe("firstUrlSegment", () => {
  it("drops route groups and returns the first real segment", () => {
    expect(firstUrlSegment("(marketing)/answers")).toBe("answers");
    expect(firstUrlSegment("foo/answers")).toBe("foo");
    expect(firstUrlSegment("answers")).toBe("answers");
  });

  it("returns null for the app root", () => {
    expect(firstUrlSegment("")).toBe(null);
  });
});

describe("publicRouteCollisions", () => {
  it("returns public dirs that collide with route segments", () => {
    expect(publicRouteCollisions(["answers", "images"], ["answers", "blog"])).toEqual([
      "answers",
    ]);
  });
});

describe("public-dir-collision check", () => {
  it("flags a public/ dir colliding with an app route", async () => {
    const findings = await publicDirCollision.run(fixtureCtx("public-collide", "next"));
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("public-dir-collision");
    expect(findings[0].severity).toBe("error");
  });

  it("passes when public/ dirs do not collide with routes", async () => {
    const findings = await publicDirCollision.run(fixtureCtx("public-clean", "next"));
    expect(findings).toHaveLength(0);
  });
});
