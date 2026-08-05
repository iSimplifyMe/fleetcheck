/**
 * fork-identity-consistency — a forked repo must carry ITS OWN identity in the
 * two places that aim infrastructure at the wrong site: workflow `sst:app` tag
 * filters, and literal hosts in the robots surfaces. Both are compared against
 * `sst.config.ts`, the deploy-time source of truth — no fleet roster needed,
 * so the check works on any SST repo without naming any client anywhere.
 *
 * Origin incidents:
 * - thebiggestcases 2026-08-05: both deploy workflows tag-filtered
 *   `Key=sst:app,Values=<the fork parent's app name>`. On the shared AWS
 *   account that filter resolves to a REAL sibling distribution, so a deploy
 *   would have shipped correctly, purged the PARENT's CloudFront, reported
 *   green, and left this site's own edges serving the previous build for the
 *   full `s-maxage=31536000` year. The workflow's own "no distribution found"
 *   branch could never fire — it DID find one.
 * - afterloss-atlas 2026-05-17: `robots.ts` still emitted the fork-origin
 *   domain (sitemap + host) at launch. A content reframe and a 100/100 AEO
 *   pass both structurally missed it, because neither fetches the robots host.
 *
 * False-positive posture (value-based, never path-based):
 * - A workflow with no `sst:app` line produces nothing — repos legitimately
 *   resolve distributions other ways (by DomainName, or not at all).
 * - Host comparison runs only when sst.config.ts declares a domain, and only
 *   against literal hosts: a robots.ts that derives its host from site config
 *   has no literal to scan and produces nothing.
 * - `*.cloudfront.net` and localhost hosts are staging/dev shapes, ignored.
 * - Subdomains of a declared domain (www., app., …) are the same identity.
 */

import { join } from "node:path";
import { readdirSync } from "node:fs";
import { readFileSafe } from "../lib.js";
import type { Check, Finding } from "../../types.js";

const CHECK_ID = "fork-identity-consistency";

export interface SstIdentity {
  /** the SST app name — what tags every AWS resource */
  app: string | null;
  /** apex domains the config declares (domain name + aliases + redirects) */
  domains: string[];
}

/** Bare-hostname literal: has a dot, no slash/space/@, ends in a TLD-ish label. */
const HOST_LITERAL = /["']([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)["']/gi;

/** Version strings ("4.0.2") satisfy the literal shape; a real host ends in letters. */
const TLD_ISH = /\.[a-z]{2,}$/i;

/**
 * Strip // and block comments from TS without touching string literals — a
 * robots.ts docblock legitimately cites another site as evidence (roxspa's
 * does), and a check that flags provenance notes gets relaxed rather than
 * obeyed. String-aware so `https://` inside a value survives.
 */
export function stripTsComments(text: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | "'" | '"' | "`" = "code";
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (mode === "code") {
      if (c === "/" && next === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && next === "*") { mode = "block"; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") mode = c;
      out += c; i++; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } i++; continue; }
    if (mode === "block") {
      if (c === "*" && next === "/") { mode = "code"; i += 2; }
      else { if (c === "\n") out += c; i++; }
      continue;
    }
    if (c === "\\") { out += c + (next ?? ""); i += 2; continue; }
    if (c === mode) mode = "code";
    out += c; i++;
  }
  return out;
}

export function parseSstIdentity(sstConfig: string): SstIdentity {
  // The app name is the first `name:` whose value has NO dot — fleet app names
  // are slugs; dotted `name:` values are domain declarations further down.
  let app: string | null = null;
  const nameRe = /name:\s*["']([A-Za-z0-9._-]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(sstConfig))) {
    if (!m[1].includes(".")) {
      app = m[1];
      break;
    }
  }
  const domains = new Set<string>();
  HOST_LITERAL.lastIndex = 0;
  while ((m = HOST_LITERAL.exec(sstConfig))) {
    const host = m[1].toLowerCase();
    if (!TLD_ISH.test(host)) continue; // "4.0.2" and friends are versions, not hosts
    if (host.endsWith(".cloudfront.net")) continue;
    domains.add(host.replace(/^www\./, ""));
  }
  return { app, domains: [...domains] };
}

/** Every `sst:app` tag-filter value in a workflow must be this repo's app. */
export function assessWorkflowFilters(
  app: string,
  workflows: Record<string, string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const [file, content] of Object.entries(workflows)) {
    content.split("\n").forEach((line, idx) => {
      if (!line.includes("sst:app")) return;
      const v = line.match(/Values=([A-Za-z0-9._-]+)/);
      if (!v) return;
      if (v[1] !== app) {
        findings.push({
          checkId: CHECK_ID,
          severity: "error",
          message:
            `workflow tag-filters sst:app "${v[1]}" but this repo's SST app is "${app}" — ` +
            `on a shared account this aims the invalidation at ANOTHER site's distribution ` +
            `and the deploy fails by succeeding (thebiggestcases, 2026-08-05)`,
          file,
          line: idx + 1,
        });
      }
    });
  }
  return findings;
}

/**
 * Literal hosts in robots surfaces must belong to a domain sst.config declares.
 * Runs only when the config declares at least one domain.
 */
export function assessRobotsHosts(
  domains: string[],
  sources: Record<string, string>,
): Finding[] {
  if (domains.length === 0) return [];
  const findings: Finding[] = [];
  const owned = (host: string): boolean => {
    const apex = host.replace(/^www\./, "");
    return domains.some((d) => apex === d || apex.endsWith(`.${d}`));
  };
  for (const [file, rawContent] of Object.entries(sources)) {
    const content = /\.(ts|tsx|js|mjs)$/.test(file) ? stripTsComments(rawContent) : rawContent;
    content.split("\n").forEach((line, idx) => {
      for (const m of line.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        const host = m[1].toLowerCase().replace(/\.$/, "");
        if (!TLD_ISH.test(host)) continue; // bare IPs are dev shapes
        if (host.endsWith(".cloudfront.net")) continue;
        if (host === "localhost" || host.startsWith("localhost:")) continue;
        if (!owned(host)) {
          findings.push({
            checkId: CHECK_ID,
            severity: "error",
            message:
              `robots surface names "${host}" but sst.config.ts declares ${domains.join(", ")} — ` +
              `fork-origin domain residue ships the WRONG site identity to crawlers ` +
              `(afterloss-atlas, 2026-05-17)`,
            file,
            line: idx + 1,
          });
        }
      }
    });
  }
  return findings;
}

const ROBOTS_CANDIDATES = [
  "app/robots.ts",
  "src/app/robots.ts",
  "public/robots.txt",
];

export const forkIdentityConsistency: Check = {
  id: CHECK_ID,
  title: "Workflow sst:app filters and robots hosts match this repo's own SST identity",
  severity: "error",
  appliesTo: (repo) => readFileSafe(join(repo.path, "sst.config.ts")) !== null,
  run(repo): Finding[] {
    const sst = readFileSafe(join(repo.path, "sst.config.ts"));
    if (!sst) return [];
    const { app, domains } = parseSstIdentity(sst);

    const findings: Finding[] = [];

    if (app) {
      const workflows: Record<string, string> = {};
      const wfDir = join(repo.path, ".github", "workflows");
      let names: string[] = [];
      try {
        names = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f));
      } catch {
        names = [];
      }
      for (const f of names) {
        const c = readFileSafe(join(wfDir, f));
        if (c) workflows[join(".github", "workflows", f)] = c;
      }
      findings.push(...assessWorkflowFilters(app, workflows));
    }

    const robots: Record<string, string> = {};
    for (const rel of ROBOTS_CANDIDATES) {
      const c = readFileSafe(join(repo.path, rel));
      if (c) robots[rel] = c;
    }
    findings.push(...assessRobotsHosts(domains, robots));

    return findings;
  },
};
