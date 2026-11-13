/**
 * sst-build-env-secret — an SSR site component writes the deploy host's whole
 * environment into the SST state in plaintext, unless the build command's
 * environment is marked as a secret.
 *
 * Origin incident (fleet-wide, found 2026-11-07, counted 2026-11-12): every
 * `sst.aws.Nextjs` (and every other SsrSite) builds through a
 * `command:local:Command` whose input is
 * `environment: { SST: "1", ...process.env, ...environment, ...linkEnvs }`
 * (`.sst/platform/src/components/base/base-ssr-site.ts`). Pulumi stores that
 * input AND output unencrypted in the state bucket, at
 * `app/<app>/<stage>.json`, and in every `eventlog/` and `snapshot/` version. 133 of 182 state objects in
 * four AWS accounts held a plaintext build environment: the CI runner's
 * secrets, every `SST_SECRET_*` value, and on Mac-deployed stacks the
 * deployer's shell including a long-lived AWS key.
 *
 * The fix is one stack transformation, registered before the site is created:
 *
 *   const command = await import("@pulumi/command");
 *   $transform(command.local.Command, (args) => {
 *     if (args.environment) args.environment = $util.secret(args.environment);
 *   });
 *
 * or, where the app's type check covers sst.config.ts and cannot resolve
 * "@pulumi/command", the same thing written against the resource type:
 *
 *   $util.runtime.registerStackTransformation((resource: any) => {
 *     if (resource.type !== "command:local:Command" || !resource.props?.environment) return undefined;
 *     resource.props.environment = $util.secret(resource.props.environment);
 *     return { props: resource.props, opts: resource.opts };
 *   });
 *
 * What fires:
 * - [warning] a config that creates an SSR site component and carries neither
 *             form of the transformation.
 * - [warning] a transformation registered AFTER the first SSR site component
 *             of the same function: a stack transformation only applies to
 *             resources registered after it, so that site's state stays
 *             plaintext while the config looks fixed.
 *
 * What stays silent (shape-based, never path-based):
 * - configs with no SSR site component. `sst.aws.StaticSite` stores only the
 *   `environment` the config passes, not `process.env`
 *   (`base-static-site.ts`), so a static builder is not this incident;
 * - either form of the transformation, in any spelling of the module handle
 *   (`command.local.Command`, `local.Command`), with or without the
 *   `if (args.environment)` guard;
 * - the words in a comment or a string: the parse is a TypeScript AST.
 *
 * Severity is `warning` while the fleet wave that adds the transformation is
 * still merging; it becomes `security` once every stack carries it.
 *
 * Not covered here: a stage keeps its old plaintext state until it is deployed
 * once with the transformation. That is a fact about the state bucket, not
 * about the repository; the state inventory reads it.
 */

import ts from "typescript";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readFileSafe } from "../lib.js";
import type { Check, Finding } from "../../types.js";

const CHECK_ID = "sst-build-env-secret";

/** Every class that extends SsrSite in SST v3/v4 (`components/aws/*.ts`). */
const SSR_COMPONENTS = new Set([
  "Nextjs",
  "Astro",
  "Remix",
  "SvelteKit",
  "SolidStart",
  "Nuxt",
  "React",
  "TanStackStart",
  "Analog",
]);

export interface SsrSite {
  /** `Nextjs`, `Astro`, … */
  component: string;
  /** 1-based line of the `new sst.aws.X(` */
  line: number;
}

export interface EnvTransform {
  /** `transform` = `$transform(…local.Command, cb)`; `stack` = `registerStackTransformation(cb)` */
  form: "transform" | "stack";
  /** 1-based line of the call */
  line: number;
  /** the SSR site created before this call in the same function, if any */
  after?: SsrSite;
}

export interface BuildEnvRead {
  sites: SsrSite[];
  transforms: EnvTransform[];
}

type FnLike = ts.FunctionLikeDeclaration | ts.SourceFile;

function enclosingFunction(n: ts.Node): FnLike {
  let p: ts.Node | undefined = n.parent;
  while (p) {
    if (ts.isFunctionLike(p) && "body" in p) return p as ts.FunctionLikeDeclaration;
    if (ts.isSourceFile(p)) return p;
    p = p.parent;
  }
  return n.getSourceFile();
}

/** `sst.aws.Nextjs` → `Nextjs`, only for a chain that starts at `sst`. */
function ssrComponentName(expr: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expr)) return null;
  if (!SSR_COMPONENTS.has(expr.name.text)) return null;
  let root: ts.Expression = expr.expression;
  while (ts.isPropertyAccessExpression(root)) root = root.expression;
  return ts.isIdentifier(root) && root.text === "sst" ? expr.name.text : null;
}

/** True when the node holds `<x>.environment = <call to …secret(…)>`. */
function assignsSecretEnvironment(body: ts.Node): boolean {
  let found = false;
  const callsSecret = (n: ts.Node): boolean => {
    let hit = false;
    const visit = (c: ts.Node): void => {
      if (hit) return;
      if (ts.isCallExpression(c)) {
        const callee = c.expression;
        const name = ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ts.isIdentifier(callee)
            ? callee.text
            : "";
        if (name === "secret") {
          hit = true;
          return;
        }
      }
      ts.forEachChild(c, visit);
    };
    visit(n);
    return hit;
  };
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ((ts.isPropertyAccessExpression(n.left) && n.left.name.text === "environment") ||
        (ts.isElementAccessExpression(n.left) &&
          ts.isStringLiteralLike(n.left.argumentExpression) &&
          n.left.argumentExpression.text === "environment")) &&
      callsSecret(n.right)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

function hasStringLiteral(body: ts.Node, text: string): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isStringLiteralLike(n) && n.text === text) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return found;
}

/** `command.local.Command` or `local.Command`: the class of `command:local:Command`. */
function isLocalCommand(target: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(target) || target.name.text !== "Command") return false;
  const owner = target.expression;
  if (ts.isIdentifier(owner)) return owner.text === "local";
  return ts.isPropertyAccessExpression(owner) && owner.name.text === "local";
}

const isFn = (n: ts.Node | undefined): n is ts.ArrowFunction | ts.FunctionExpression =>
  !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

/** Reads one sst.config.ts: the SSR sites it creates and the transformations it registers. */
export function readBuildEnv(source: string): BuildEnvRead {
  const sf = ts.createSourceFile("sst.config.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lineOf = (n: ts.Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const sites: Array<SsrSite & { pos: number; fn: FnLike }> = [];
  const transforms: Array<EnvTransform & { pos: number; fn: FnLike }> = [];

  const visit = (n: ts.Node): void => {
    if (ts.isNewExpression(n)) {
      const component = ssrComponentName(n.expression);
      if (component) sites.push({ component, line: lineOf(n), pos: n.getStart(sf), fn: enclosingFunction(n) });
    } else if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && callee.text === "$transform" && n.arguments.length >= 2) {
        const target = n.arguments[0];
        const cb = n.arguments[1];
        if (isLocalCommand(target) && isFn(cb) && assignsSecretEnvironment(cb.body)) {
          transforms.push({ form: "transform", line: lineOf(n), pos: n.getStart(sf), fn: enclosingFunction(n) });
        }
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "registerStackTransformation" &&
        n.arguments.length >= 1
      ) {
        const cb = n.arguments[0];
        if (isFn(cb) && hasStringLiteral(cb.body, "command:local:Command") && assignsSecretEnvironment(cb.body)) {
          transforms.push({ form: "stack", line: lineOf(n), pos: n.getStart(sf), fn: enclosingFunction(n) });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  return {
    sites: sites.map(({ component, line }) => ({ component, line })),
    transforms: transforms.map((t) => {
      // Order only means something inside one function body: a helper declared above
      // run() and called later is created after a transformation registered in run().
      const before = sites.filter((s) => s.fn === t.fn && s.pos < t.pos).sort((a, b) => a.pos - b.pos)[0];
      return {
        form: t.form,
        line: t.line,
        ...(before ? { after: { component: before.component, line: before.line } } : {}),
      };
    }),
  };
}

/** `sst.config.ts` at the repo root and one directory down (an app in a subfolder). */
export function sstConfigFiles(repoPath: string): string[] {
  const out: string[] = [];
  if (existsSync(join(repoPath, "sst.config.ts"))) out.push("sst.config.ts");
  let entries: string[] = [];
  try {
    entries = readdirSync(repoPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
      .map((d) => d.name);
  } catch {
    return out;
  }
  for (const dir of entries.sort()) {
    if (existsSync(join(repoPath, dir, "sst.config.ts"))) out.push(`${dir}/sst.config.ts`);
  }
  return out;
}

export const sstBuildEnvSecret: Check = {
  id: CHECK_ID,
  title: "SSR site configs mark the build command's environment as a secret, so SST's state holds it encrypted",
  severity: "warning",
  appliesTo: (repo) => sstConfigFiles(repo.path).length > 0,
  run(repo): Finding[] {
    const findings: Finding[] = [];
    for (const file of sstConfigFiles(repo.path)) {
      const source = readFileSafe(join(repo.path, file));
      if (!source) continue;
      const { sites, transforms } = readBuildEnv(source);
      if (sites.length === 0) continue;

      if (transforms.length === 0) {
        const names = [...new Set(sites.map((s) => `sst.aws.${s.component}`))].join(", ");
        findings.push({
          checkId: CHECK_ID,
          severity: "warning",
          message:
            `${names} builds through \`command:local:Command\` with \`environment = { ...process.env, … }\`, and ` +
            `nothing here marks that environment as a secret: every deploy writes the deploy host's whole ` +
            `environment (CI secrets, every \`SST_SECRET_*\`, a Mac shell's keys) into the SST state bucket in ` +
            `plaintext, in every version. At the top of \`run()\`, before the site is created, add ` +
            `\`const command = await import("@pulumi/command"); $transform(command.local.Command, (args) => { ` +
            `if (args.environment) args.environment = $util.secret(args.environment); });\` (or the ` +
            `\`$util.runtime.registerStackTransformation\` form where the app's type check covers this file), ` +
            `then deploy every stage once: a stage's state stays plaintext until it has been deployed with it`,
          file,
          line: sites[0].line,
          meta: { components: sites.map((s) => s.component) },
        });
        continue;
      }

      // Effective when at least one transformation is registered before every site it shares a function with.
      const effective = transforms.some((t) => !t.after);
      if (!effective) {
        const t = transforms[0];
        findings.push({
          checkId: CHECK_ID,
          severity: "warning",
          message:
            `the build-environment transformation is registered after sst.aws.${t.after!.component} is created ` +
            `(line ${t.after!.line}): a stack transformation only applies to resources registered after it, so ` +
            `that site's build environment is still stored in plaintext while the config looks fixed. Move it ` +
            `to the top of \`run()\``,
          file,
          line: t.line,
          meta: { form: t.form, afterLine: t.after!.line },
        });
      }
    }
    return findings;
  },
};
