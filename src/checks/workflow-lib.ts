/**
 * Shared GitHub-workflow reading for the deploy-path checks. No YAML
 * dependency: the shapes read here (top-level `on:` triggers, UPPER_SNAKE
 * mapping keys, `sst deploy` run lines) are flat and regular across the fleet.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readFileSafe } from "./lib.js";

export interface WorkflowFile {
  /** repo-relative path, `.github/workflows/<name>` */
  file: string;
  content: string;
}

/** Every workflow file in the repo, sorted by name. */
export function readWorkflows(repoPath: string): WorkflowFile[] {
  const dir = join(repoPath, ".github", "workflows");
  let names: string[];
  try {
    names = readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f)).sort();
  } catch {
    return [];
  }
  const out: WorkflowFile[] = [];
  for (const f of names) {
    const content = readFileSafe(join(dir, f));
    if (content !== null) out.push({ file: `.github/workflows/${f}`, content });
  }
  return out;
}

function indentOf(line: string): number {
  return (line.match(/^\s*/) as RegExpMatchArray)[0].length;
}

/** Trigger names under the top-level `on:` — block mapping, flow sequence or scalar form. */
export function parseTriggers(content: string): string[] {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:on|"on"|'on')\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const rest = m[1].replace(/\s+#.*$/, "").trim();
    if (rest.startsWith("[")) {
      return rest
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (rest) return [rest];
    const keys: string[] = [];
    let child = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const ind = indentOf(l);
      if (ind === 0) break;
      if (child === -1) child = ind;
      if (ind !== child) continue;
      const k = /^([A-Za-z_][\w-]*)\s*:/.exec(t);
      if (k) keys.push(k[1]);
    }
    return keys;
  }
  return [];
}

/** True when `workflow_dispatch` is the ONLY trigger — nothing ever runs it automatically. */
export function isDispatchOnly(triggers: string[]): boolean {
  return triggers.length > 0 && triggers.every((t) => t === "workflow_dispatch");
}

/**
 * True when the workflow runs `sst deploy` against production — a literal
 * `--stage production`, a production stage variable, or a stage chosen at
 * run time (`--stage ${{ inputs.stage }}`), which can be production.
 */
export function isProductionDeploy(content: string): boolean {
  if (!/\bsst\s+(?:deploy\b|\$\{\{)/.test(content)) return false;
  if (/--stage[\s=]+["']?production\b/.test(content)) return true;
  if (/\b(?:SST_STAGE|STAGE)\s*[:=]\s*["']?production\b/.test(content)) return true;
  if (/\bstage\s*:\s*["']?production\b/i.test(content)) return true;
  if (/--stage[\s=]+["']?\$(?:\{\{|[A-Za-z_{])/.test(content)) return true;
  return false;
}

/** 1-based line of the first `sst deploy` run line, if any. */
export function deployLine(content: string): number | undefined {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => /\bsst\s+(?:deploy\b|\$\{\{)/.test(l));
  return idx === -1 ? undefined : idx + 1;
}

/**
 * Env names the workflow defines for its steps: UPPER_SNAKE mapping keys
 * (`env:` / `with:` blocks at any level) and `NAME=value` assignments in run
 * lines. Lower-case YAML keys (`steps:`, `run:`) never match.
 */
export function definedEnvNames(content: string): Set<string> {
  const out = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const key = /^\s*([A-Z][A-Z0-9_]*)\s*:/.exec(line);
    if (key) out.add(key[1]);
    for (const m of line.matchAll(/(?:^|[\s;&|])(?:export\s+)?([A-Z][A-Z0-9_]*)=/g)) out.add(m[1]);
  }
  return out;
}
