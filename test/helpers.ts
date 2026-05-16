import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { RepoContext, RepoKind } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Build a RepoContext pointing at a test fixture directory. */
export function fixtureCtx(name: string, kind: RepoKind = "other"): RepoContext {
  return {
    name,
    path: resolve(here, "fixtures", name),
    kind,
    hasNext: kind === "next",
  };
}
