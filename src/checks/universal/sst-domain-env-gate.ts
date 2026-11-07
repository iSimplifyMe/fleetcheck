/**
 * sst-domain-env-gate — an environment variable that decides whether
 * `domain:` EXISTS in sst.config.ts is a teardown waiting for a shell that
 * lacks it.
 *
 * Origin incident (labreastandbody, 2026-11-07, ~30 min dark): the config read
 * `const CF_ZONE = process.env.CF_ZONE_LABREASTANDBODY || ""` and set
 * `domain: isProduction && CF_ZONE ? {…} : undefined`. The first-ever CI
 * dispatch of `deploy-production.yml` had no such variable, so SST saw "no
 * custom domain", REMOVED the apex + www Cloudflare records, the www redirect
 * and tried to delete the certificate — all reported as a green deploy. The
 * same shape bites a Mac shell without the variable exactly the same way.
 *
 * What fires:
 * - [error]   a workflow that runs `sst deploy` for production (literal stage
 *             or a stage chosen at run time) without defining a gating env var.
 * - [warning] the gated shape itself when nothing in the config fails loudly
 *             (`throw` / `process.exit`) for the missing value.
 *
 * What stays silent (value-based, never path-based):
 * - env vars that only FEED a value inside an existing domain object
 *   (`domain: { name: process.env.DOMAIN || "x.com" }`) — the domain exists
 *   either way;
 * - stage/infra variables (`SST_*`, `STAGE`, `NODE_ENV`, `AWS_*`, `GITHUB_*`)
 *   — a stage switch legitimately decides which stage gets a domain;
 * - staging-only workflows — a staging deploy has no production domain to lose;
 * - gates guarded by a throw that names the variable (tulieye's arm switch).
 *
 * The parse is a real TypeScript AST (identifier → `process.env.*`
 * provenance, transitively, in declaration order), not a regex over lines.
 */

import ts from "typescript";
import { join } from "node:path";
import { readFileSafe } from "../lib.js";
import {
  definedEnvNames,
  deployLine,
  isProductionDeploy,
  readWorkflows,
} from "../workflow-lib.js";
import type { Check, Finding } from "../../types.js";

const CHECK_ID = "sst-domain-env-gate";

/** Env names whose absence legitimately changes the STAGE, never a stage's domain. */
const STAGE_ENV = /^(?:SST_|STAGE$|NODE_ENV$|CI$|GITHUB_|AWS_|PULUMI_)/;

export interface DomainGate {
  /** 1-based line of the `domain:` property */
  line: number;
  /** config identifiers the gate flows through (`CF_ZONE`, `domainName`) */
  identifiers: string[];
  /** the env vars whose absence switches the domain off */
  envNames: string[];
  /** true when a throw / process.exit in the config names the gate */
  guarded: boolean;
}

function isProcessEnv(n: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(n) &&
    ts.isIdentifier(n.expression) &&
    n.expression.text === "process" &&
    n.name.text === "env"
  );
}

/** `process.env.X` / `process.env["X"]` names anywhere under the node. */
function directEnvNames(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && isProcessEnv(n.expression)) {
      out.push(n.name.text);
      return;
    }
    if (
      ts.isElementAccessExpression(n) &&
      isProcessEnv(n.expression) &&
      ts.isStringLiteralLike(n.argumentExpression)
    ) {
      out.push(n.argumentExpression.text);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** Bare identifiers under the node (`$app.stage` contributes `$app`, not `stage`). */
function identifiersIn(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      out.push(n.text);
      return;
    }
    if (ts.isPropertyAccessExpression(n)) {
      visit(n.expression);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

/** identifier → env names it derives from, transitively, in declaration order. */
function envByIdentifier(sf: ts.SourceFile): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer) {
      if (ts.isIdentifier(n.name)) {
        const names = new Set(directEnvNames(n.initializer));
        for (const id of identifiersIn(n.initializer)) {
          for (const e of map.get(id) ?? []) names.add(e);
        }
        if (names.size > 0) map.set(n.name.text, names);
      } else if (ts.isObjectBindingPattern(n.name) && isProcessEnv(n.initializer)) {
        for (const el of n.name.elements) {
          if (!ts.isIdentifier(el.name)) continue;
          const prop =
            el.propertyName && ts.isIdentifier(el.propertyName)
              ? el.propertyName.text
              : el.name.text;
          map.set(el.name.text, new Set([prop]));
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return map;
}

/** Expressions whose truthiness decides whether the domain exists at all. */
function gatingExpressions(init: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(init) || ts.isAsExpression(init) || ts.isNonNullExpression(init)) {
    return gatingExpressions(init.expression);
  }
  if (ts.isIdentifier(init)) return init.text === "undefined" ? [] : [init];
  if (ts.isPropertyAccessExpression(init) || ts.isElementAccessExpression(init)) return [init];
  if (ts.isConditionalExpression(init)) {
    return [
      init.condition,
      ...gatingExpressions(init.whenTrue),
      ...gatingExpressions(init.whenFalse),
    ];
  }
  if (ts.isBinaryExpression(init)) {
    const k = init.operatorToken.kind;
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) {
      return [init.left, ...gatingExpressions(init.right)];
    }
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      return [...gatingExpressions(init.left), ...gatingExpressions(init.right)];
    }
  }
  return []; // object literal, string, call — the domain exists regardless
}

/** Text of every throw / process.exit and of the `if (…)` that leads to it. */
function loudGuards(sf: ts.SourceFile): string[] {
  const texts: string[] = [];
  const guardOf = (n: ts.Node): void => {
    let p: ts.Node | undefined = n.parent;
    for (let depth = 0; p && depth < 4; depth++, p = p.parent) {
      if (ts.isIfStatement(p)) {
        texts.push(p.expression.getText(sf));
        break;
      }
      if (ts.isConditionalExpression(p) || ts.isBinaryExpression(p)) {
        texts.push(p.getText(sf));
        break;
      }
    }
  };
  const visit = (n: ts.Node): void => {
    if (ts.isThrowStatement(n)) {
      texts.push(n.expression.getText(sf));
      guardOf(n);
    } else if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === "process" &&
      n.expression.name.text === "exit"
    ) {
      guardOf(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return texts;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

export function findDomainGates(source: string): DomainGate[] {
  const sf = ts.createSourceFile(
    "sst.config.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const byIdent = envByIdentifier(sf);
  const guards = loudGuards(sf);
  const gates: DomainGate[] = [];

  const record = (node: ts.Node, exprs: ts.Expression[], shorthand?: string): void => {
    const idents = new Set<string>();
    const envs = new Set<string>();
    if (shorthand) {
      for (const e of byIdent.get(shorthand) ?? []) {
        idents.add(shorthand);
        envs.add(e);
      }
    }
    for (const g of exprs) {
      for (const e of directEnvNames(g)) envs.add(e);
      for (const id of identifiersIn(g)) {
        const derived = byIdent.get(id);
        if (!derived) continue;
        idents.add(id);
        for (const e of derived) envs.add(e);
      }
    }
    const envNames = [...envs].filter((e) => !STAGE_ENV.test(e));
    if (envNames.length === 0) return;
    const words = [...idents, ...envNames];
    const guarded = guards.some((t) =>
      words.some((w) => new RegExp(`(?:^|[^\\w$])${escapeRe(w)}(?![\\w$])`).test(t)),
    );
    gates.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      identifiers: [...idents],
      envNames,
      guarded,
    });
  };

  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n) && propertyName(n.name) === "domain") {
      record(n, gatingExpressions(n.initializer));
    } else if (ts.isShorthandPropertyAssignment(n) && n.name.text === "domain") {
      record(n, [], "domain");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return gates;
}

const code = (s: string): string => `\`${s}\``;

export const sstDomainEnvGate: Check = {
  id: CHECK_ID,
  title: "Env vars that decide whether `domain:` exists are set by every production deploy workflow",
  severity: "error",
  appliesTo: (repo) => readFileSafe(join(repo.path, "sst.config.ts")) !== null,
  run(repo): Finding[] {
    const sst = readFileSafe(join(repo.path, "sst.config.ts"));
    if (!sst) return [];
    const gates = findDomainGates(sst);
    if (gates.length === 0) return [];

    const findings: Finding[] = [];
    const prodWorkflows = readWorkflows(repo.path).filter((w) => isProductionDeploy(w.content));

    for (const gate of gates) {
      for (const wf of prodWorkflows) {
        const defined = definedEnvNames(wf.content);
        const missing = gate.envNames.filter((e) => !defined.has(e));
        if (missing.length === 0) continue;
        findings.push({
          checkId: CHECK_ID,
          severity: "error",
          message:
            `runs \`sst deploy\` for production without ${missing.map(code).join(", ")}, which ` +
            `sst.config.ts:${gate.line} uses to decide whether \`domain:\` exists — unset, SST sees ` +
            `"no custom domain" and REMOVES the live DNS records, aliases and redirect while the run ` +
            `stays green (labreastandbody 2026-11-07, ~30 min dark); set it in the deploy step's env ` +
            `and run \`sst diff --stage production\` before the first dispatch`,
          file: wf.file,
          line: deployLine(wf.content),
          meta: { envNames: missing, configLine: gate.line },
        });
      }
      if (!gate.guarded) {
        findings.push({
          checkId: CHECK_ID,
          severity: "warning",
          message:
            `\`domain:\` is switched OFF when ${gate.envNames.map(code).join(", ")} is unset and ` +
            `nothing in the config fails loudly for it — any deploy shell without the variable (CI ` +
            `or a Mac) tears the production domain down "successfully"; throw when the stage is ` +
            `production and the value is empty so the deploy stops instead`,
          file: "sst.config.ts",
          line: gate.line,
          meta: { envNames: gate.envNames, identifiers: gate.identifiers },
        });
      }
    }
    return findings;
  },
};
