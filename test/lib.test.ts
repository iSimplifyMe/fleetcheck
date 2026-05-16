import { describe, it, expect } from "vitest";
import { matchingLines } from "../src/checks/lib.js";

describe("matchingLines", () => {
  it("returns 1-based line numbers for matches", () => {
    const content = "line one\nconst x = edge\nline three";
    const hits = matchingLines(content, /edge/);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(2);
    expect(hits[0].text).toContain("edge");
  });

  it("returns empty when nothing matches", () => {
    expect(matchingLines("nothing here", /xyz/)).toEqual([]);
  });
});
