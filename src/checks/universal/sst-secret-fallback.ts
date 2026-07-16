/**
 * sst-secret-fallback — app secrets in sst.config.ts must come from
 * `sst.Secret`, never `process.env.X || ""` fallbacks or hardcoded literals.
 *
 * Encodes the April 2026 apex-portal incident class (6 prod incidents,
 * 4/03–4/04): AUTH_SECRET shipped as "" because the deploy shell lacked the
 * env var — 9 tenants lost GSC data, bot webhooks 401'd, push notifications
 * died silently. An empty-string fallback turns "missing secret" from a loud
 * deploy failure into silent breakage. `new sst.Secret(...)` +
 * `sst secret set` fails the deploy instead.
 *
 * Allowlisted (calibrated against the fleet's sst.config.ts files, 2026-07):
 *   - infra credentials that legitimately come from the shell/CI env
 *     (AWS_*, CLOUDFLARE_*, CF_ZONE_*, GITHUB_*) — per the fleet rule
 *     "shell env = AWS/CF infra creds only";
 *   - public-by-design values (NEXT_PUBLIC_*, *_PUBLISHABLE_KEY);
 *   - URLs (*_URL) — never secrets, even when the name contains AUTH.
 *
 * Only secret-looking names fire, so config defaults like
 * `CONTACT_FORM_TO || "contact@…"` or `PLATFORM_FEE_PERCENT || "0.4"` pass.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSafe } from "../lib.js";
import type { Check, Finding } from "../../types.js";

/** Env-var names that legitimately fall back / come from the shell env. */
const ALLOWLIST: RegExp[] = [
  /^AWS_/,
  /^CLOUDFLARE_/,
  /^CF_ZONE_/,
  /^GITHUB_/,
  /^NEXT_PUBLIC_/,
  /_PUBLISHABLE_KEY$/,
  /_URL$/,
];

/** Name fragments that mark an env var as secret-like. */
const SECRET_NAME = /SECRET|TOKEN|PASSW|PWD|KEY|AUTH|PRIVATE|CREDENTIAL|SIGNING|HMAC|DSN/;

export function isAllowlistedEnvVar(name: string): boolean {
  return ALLOWLIST.some((rx) => rx.test(name));
}

export function looksSecret(name: string): boolean {
  return SECRET_NAME.test(name);
}

/** `process.env.NAME || "literal"` / `?? 'literal'` (any string-literal fallback). */
const ENV_FALLBACK =
  /process\.env\.([A-Z][A-Z0-9_]*)\s*(?:\|\||\?\?)\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)/g;

/** `SOME_SECRET_NAME: "long literal"` — a hardcoded value on an env-style key. */
const DIRECT_LITERAL =
  /(?:^\s*|[{,(]\s*)["']?([A-Z][A-Z0-9_]{2,})["']?\s*:\s*("[^"]{8,}"|'[^']{8,}')/g;

export interface SecretFallbackHit {
  kind: "fallback" | "literal";
  name: string;
  /** for kind=fallback: the fallback literal was the empty string */
  empty?: boolean;
}

/** Dangerous app-secret patterns in one line of sst.config.ts. */
export function sstSecretFallbackHits(line: string): SecretFallbackHit[] {
  const hits: SecretFallbackHit[] = [];

  for (const m of line.matchAll(ENV_FALLBACK)) {
    const name = m[1];
    if (isAllowlistedEnvVar(name) || !looksSecret(name)) continue;
    const literal = m[2] ?? m[3] ?? m[4] ?? "";
    hits.push({ kind: "fallback", name, empty: literal === "" });
  }

  for (const m of line.matchAll(DIRECT_LITERAL)) {
    const name = m[1];
    if (isAllowlistedEnvVar(name) || !looksSecret(name)) continue;
    hits.push({ kind: "literal", name });
  }

  return hits;
}

function messageFor(hit: SecretFallbackHit): string {
  const fix =
    "Use `new sst.Secret(\"…\")` + `sst secret set` so a missing value fails " +
    "the deploy loudly instead.";
  if (hit.kind === "literal") {
    return (
      `App secret \`${hit.name}\` is hardcoded in sst.config.ts — the value ` +
      `is committed to source. ${fix}`
    );
  }
  if (hit.empty) {
    return (
      `App secret \`${hit.name}\` falls back to an empty string — a deploy ` +
      `from a shell without the env var silently ships a blank secret ` +
      `(April 2026 apex incident class). ${fix}`
    );
  }
  return (
    `App secret \`${hit.name}\` has a hardcoded string fallback — the ` +
    `fallback ships in the repo and masks a missing env var. ${fix}`
  );
}

export const sstSecretFallback: Check = {
  id: "sst-secret-fallback",
  title: "sst.config.ts app secrets use sst.Secret, not env fallbacks or literals",
  severity: "security",
  appliesTo: (repo) => existsSync(join(repo.path, "sst.config.ts")),
  run(repo): Finding[] {
    const content = readFileSafe(join(repo.path, "sst.config.ts"));
    if (!content) return [];

    const findings: Finding[] = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const hit of sstSecretFallbackHits(lines[i])) {
        findings.push({
          checkId: "sst-secret-fallback",
          severity: "security",
          message: messageFor(hit),
          file: "sst.config.ts",
          line: i + 1,
          meta: { name: hit.name, kind: hit.kind, empty: hit.empty ?? false },
        });
      }
    }
    return findings;
  },
};
