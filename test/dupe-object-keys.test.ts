import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dupeObjectKeys,
  findDuplicateEnvKeys,
  findDuplicateObjectKeys,
} from "../src/checks/universal/dupe-object-keys.js";
import { classifyRepo } from "../src/fleet.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("findDuplicateObjectKeys", () => {
  it("reports the second occurrence with the first line, per object", () => {
    const d = findDuplicateObjectKeys('const o = {\n  providers: { aws: "1" },\n  home: "aws",\n  providers: { random: "2" },\n};');
    expect(d).toEqual([{ key: "providers", line: 4, firstLine: 2 }]);
  });
  it("treats string and identifier keys as the same name, and reads shorthand/methods", () => {
    expect(findDuplicateObjectKeys('const a = 1; const o = { a, "a": 2 };')).toHaveLength(1);
    expect(findDuplicateObjectKeys("const o = { run() {}, run() {} };")).toHaveLength(1);
  });
  it("ignores computed keys, spreads, accessor pairs and same names in different objects", () => {
    expect(
      findDuplicateObjectKeys('const o = { ["a" + x]: 1, ["a" + y]: 2, ...rest, get n() { return 1; }, set n(v) {}, inner: { a: 1 }, a: 2 };'),
    ).toEqual([]);
  });
  it("parses .mjs as JavaScript", () => {
    expect(findDuplicateObjectKeys("export default { images: {}, images: {} };", "next.config.mjs")).toHaveLength(1);
  });
});

describe("findDuplicateEnvKeys", () => {
  it("reports a duplicate inside one env block", () => {
    const d = findDuplicateEnvKeys("steps:\n  - run: x\n    env:\n      A: 1\n      B: 2\n      A: 3\n");
    expect(d).toEqual([{ block: "env", key: "A", line: 6, firstLine: 4 }]);
  });
  it("does not cross blocks, and skips block-scalar continuations", () => {
    expect(
      findDuplicateEnvKeys("env:\n  A: 1\njobs:\n  j:\n    env:\n      A: 1\n    steps:\n      - with:\n          A: |\n            A: inside a value\n          B: 2\n"),
    ).toEqual([]);
  });
});

describe("dupe-object-keys check", () => {
  it("fires on the two sst.config duplicates and the workflow env duplicate", async () => {
    const findings = await dupeObjectKeys.run(classifyRepo({ name: "dupe-keys-dirty" }, fixtures));
    expect(findings.map((f) => [f.file, f.meta?.key])).toEqual([
      ["sst.config.ts", "providers"],
      ["sst.config.ts", "transform"],
      [".github/workflows/deploy-production.yml", "SHARP_VERSION"],
    ]);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
  });
  it("stays silent on legal shapes: spreads, accessors, nesting, per-step env blocks", async () => {
    expect(await dupeObjectKeys.run(classifyRepo({ name: "dupe-keys-clean" }, fixtures))).toEqual([]);
  });
});
