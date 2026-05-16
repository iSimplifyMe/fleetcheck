import { describe, it, expect } from "vitest";
import { bumpNextInPackageJson } from "../src/fixers/next-cve-bump.js";
import { addWorktreesToGitignore } from "../src/fixers/worktrees-gitignore-fix.js";

describe("bumpNextInPackageJson", () => {
  it("bumps a vulnerable next version to the patched range", () => {
    const input = '{\n  "dependencies": {\n    "next": "16.2.1"\n  }\n}\n';
    const out = bumpNextInPackageJson(input, "16.2.5");
    expect(out).toContain('"next": "^16.2.5"');
  });

  it("preserves the rest of the file", () => {
    const input =
      '{\n  "name": "x",\n  "dependencies": {\n    "next": "16.2.1",\n    "react": "19.0.0"\n  }\n}\n';
    const out = bumpNextInPackageJson(input, "16.2.5");
    expect(out).toContain('"react": "19.0.0"');
    expect(out).toContain('"name": "x"');
  });

  it("does not match next-prefixed package names", () => {
    const input = '{\n  "dependencies": {\n    "next-sitemap": "4.0.0"\n  }\n}\n';
    expect(bumpNextInPackageJson(input, "16.2.5")).toBe(null);
  });

  it("returns null when next is absent", () => {
    expect(bumpNextInPackageJson('{"dependencies":{}}', "16.2.5")).toBe(null);
  });
});

describe("addWorktreesToGitignore", () => {
  it("appends .worktrees/ when missing", () => {
    const out = addWorktreesToGitignore("node_modules/\ndist/\n");
    expect(out).toContain(".worktrees/");
  });

  it("is idempotent when .worktrees/ is already present", () => {
    const input = "node_modules/\n.worktrees/\n";
    expect(addWorktreesToGitignore(input)).toBe(input);
  });

  it("handles a file with no trailing newline", () => {
    const out = addWorktreesToGitignore("node_modules/");
    expect(out).toContain(".worktrees/");
    expect(out.endsWith("\n")).toBe(true);
  });
});
