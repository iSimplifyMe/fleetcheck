/**
 * dupe-object-keys — a duplicate key is a silent discard in a config and a
 * hard parse failure in a workflow; both read as "green" until probed.
 *
 * Origin incidents (fleet fix-it-all day, 2026-11-07, four times):
 * - scripted sst.config.ts edits inserted `providers: {…}` / `transform: {…}`
 *   into objects that already had that key further down. JavaScript keeps the
 *   LAST key, TypeScript does not stop it (configs are not type-checked in
 *   CI), SST deployed green and nothing changed — `random is not defined`
 *   twice, a ResponseHeadersPolicy created but never attached once;
 * - a workflow edit added a second `SHARP_VERSION:` to a step's `env:` —
 *   GitHub rejected the whole workflow as unparseable and the prod job never
 *   ran until the follow-up PR (surgeon-directory).
 *
 * Checked: every object literal in `sst.config.ts` / `next.config.*` (real
 * TypeScript AST; computed keys and spreads are skipped, get/set pairs are
 * legal and ignored), and every `env:` / `with:` mapping block in
 * `.github/workflows/*.yml` (same block only — two steps may each define
 * `SHARP_VERSION`, that is not a duplicate).
 */

import ts from "typescript";
import { join } from "node:path";
import { readFileSafe } from "../lib.js";
import { readWorkflows } from "../workflow-lib.js";
import type { Check, Finding } from "../../types.js";

const CHECK_ID = "dupe-object-keys";

const CONFIG_FILES = ["sst.config.ts", "next.config.ts", "next.config.mjs", "next.config.js"];

export interface DuplicateKey {
  key: string;
  /** 1-based line of the duplicate */
  line: number;
  /** 1-based line of the first occurrence */
  firstLine: number;
}

function literalName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null; // computed — cannot know statically
}

/** Duplicate property names within the same object literal, anywhere in the source. */
export function findDuplicateObjectKeys(source: string, fileName = "config.ts"): DuplicateKey[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.(?:ts|mts|cts)$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const out: DuplicateKey[] = [];
  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      const seen = new Map<string, number>();
      for (const p of n.properties) {
        let name: string | null = null;
        if (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) name = literalName(p.name);
        else if (ts.isShorthandPropertyAssignment(p)) name = p.name.text;
        if (name === null) continue;
        const first = seen.get(name);
        if (first !== undefined) out.push({ key: name, line: lineOf(p), firstLine: first });
        else seen.set(name, lineOf(p));
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export interface DuplicateYamlKey extends DuplicateKey {
  /** the block header, `env` or `with` */
  block: string;
}

/** Duplicate keys inside one `env:` / `with:` mapping block of a workflow. */
export function findDuplicateEnvKeys(yaml: string): DuplicateYamlKey[] {
  const lines = yaml.split(/\r?\n/);
  const out: DuplicateYamlKey[] = [];
  const indentOf = (l: string): number => (l.match(/^\s*/) as RegExpMatchArray)[0].length;
  for (let i = 0; i < lines.length; i++) {
    const header = /^(\s*)(env|with)\s*:\s*(?:#.*)?$/.exec(lines[i]);
    if (!header) continue;
    const base = header[1].length;
    const seen = new Map<string, number>();
    let child = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const ind = indentOf(l);
      if (ind <= base) break;
      if (child === -1) child = ind;
      if (ind < child) break;
      if (ind > child) continue; // multi-line value continuation
      if (t.startsWith("- ")) break; // a sequence, not a mapping
      const k = /^([^\s#:][^:]*?)\s*:/.exec(t);
      if (!k) continue;
      const first = seen.get(k[1]);
      if (first !== undefined) out.push({ block: header[2], key: k[1], line: j + 1, firstLine: first });
      else seen.set(k[1], j + 1);
    }
  }
  return out;
}

export const dupeObjectKeys: Check = {
  id: CHECK_ID,
  title: "No duplicate keys in config object literals or workflow env/with blocks",
  severity: "error",
  appliesTo: () => true,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const file of CONFIG_FILES) {
      const src = readFileSafe(join(repo.path, file));
      if (src === null) continue;
      for (const d of findDuplicateObjectKeys(src, file)) {
        findings.push({
          checkId: CHECK_ID,
          severity: "error",
          message:
            `duplicate key \`${d.key}\` in an object literal (first at line ${d.firstLine}) — ` +
            `JavaScript keeps the LAST one and the earlier value is silently discarded, so the deploy ` +
            `stays green while the change never lands (sst.config.ts \`providers\`/\`transform\`, ` +
            `2026-11-07 ×3); merge the two into one key`,
          file,
          line: d.line,
          meta: { key: d.key, firstLine: d.firstLine },
        });
      }
    }
    for (const wf of readWorkflows(repo.path)) {
      for (const d of findDuplicateEnvKeys(wf.content)) {
        findings.push({
          checkId: CHECK_ID,
          severity: "error",
          message:
            `duplicate \`${d.key}\` in the same \`${d.block}:\` block (first at line ${d.firstLine}) — ` +
            `GitHub rejects the workflow as unparseable, so NOTHING in it runs ` +
            `(surgeon-directory 2026-11-07); keep one`,
          file: wf.file,
          line: d.line,
          meta: { key: d.key, firstLine: d.firstLine, block: d.block },
        });
      }
    }
    return findings;
  },
};
