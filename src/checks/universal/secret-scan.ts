/**
 * secret-scan — flag credentials committed to source. Scans non-ignored files
 * (globby honors .gitignore, so gitignored env files are skipped) for common
 * provider key shapes.
 *
 * Suppressions are value/shape-based, never path-based — a real credential in
 * a test file must still fire (2026-07-16 fleet baseline: 6 false positives,
 * all structurally fake values or doc-prose marker mentions):
 *   - fixture tokens whose delimited segments spell it out (`xoxb-test-token`);
 *   - private-key markers with the END marker on the same line and no room
 *     for key material between (`"-----BEGIN PRIVATE KEY-----\nfake\n-----END…"`);
 *   - private-key markers quoted as doc prose (followed by a backtick or `…`);
 *   - an explicit escape: a `fleetcheck-ignore-next-line: <reason>` comment on
 *     the previous line — the reason is REQUIRED or the directive is inert.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { globbySync } from "globby";
import type { Check, Finding } from "../../types.js";

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  {
    name: "private key block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  { name: "Stripe live secret key", regex: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { name: "Cloudflare API token", regex: /\bcfut_[A-Za-z0-9]{32,}\b/ },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
];

/** Documented example/dummy keys that must never count as findings. */
const ALLOWLIST = ["AKIAIOSFODNN7EXAMPLE", "AKIAIOSFODNN7EXAMPLEKEY"];

/**
 * Fixture-marker segments. Only applies to matched values whose charset
 * allows `-`/`_` delimiters (Slack tokens) — AWS/Cloudflare/Stripe/GitHub
 * key bodies are delimiter-free, so they can never be value-suppressed.
 */
const FAKE_SEGMENTS = new Set([
  "test", "fake", "dummy", "example", "sample", "placeholder", "redacted",
]);

/** True when a delimited segment of the matched value marks it as a fixture. */
export function isFixtureSecret(matched: string): boolean {
  return matched
    .split(/[-_]/)
    .some((seg) => FAKE_SEGMENTS.has(seg.toLowerCase()));
}

const PK_BEGIN = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/;
const PK_END = /-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/;

/**
 * True when a private-key BEGIN marker on this line cannot be a real key:
 * either doc prose (marker immediately followed by a backtick or ellipsis),
 * or the END marker sits on the same line with < 64 chars between — even an
 * Ed25519 PEM body is far larger, so no real key material fits.
 */
export function isDocOrFixturePrivateKeyLine(line: string): boolean {
  const begin = line.match(PK_BEGIN);
  if (!begin || begin.index === undefined) return false;
  const after = line.slice(begin.index + begin[0].length);
  if (after.startsWith("`") || after.startsWith("...") || after.startsWith("…")) {
    return true;
  }
  const end = after.match(PK_END);
  return end !== null && end.index !== undefined && end.index < 64;
}

/**
 * `fleetcheck-ignore-next-line: <reason>` suppresses secret-scan findings on
 * the following line. The reason is required — without one the directive is
 * inert and the finding still fires.
 */
const IGNORE_NEXT_LINE = /fleetcheck-ignore-next-line:?\s+\S/;

const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".zip", ".gz", ".tar", ".mp4", ".mov", ".webm", ".mp3",
  ".lock", ".map",
]);

const SKIP_FILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
]);

const MAX_FILE_BYTES = 512 * 1024;

export const secretScan: Check = {
  id: "secret-scan",
  title: "No credentials committed to source",
  severity: "security",
  appliesTo: () => true,
  run(repo): Finding[] {
    const files = globbySync(["**/*"], {
      cwd: repo.path,
      gitignore: true,
      dot: true,
      onlyFiles: true,
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        "**/.claude/**",
        "**/.worktrees/**",
        "**/dist/**",
        "**/.next/**",
        "**/.sst/**",
        "**/.turbo/**",
        "**/build/**",
        "**/coverage/**",
      ],
    });

    const findings: Finding[] = [];
    for (const rel of files) {
      const base = rel.split("/").pop() ?? rel;
      if (SKIP_FILES.has(base)) continue;
      const dot = base.lastIndexOf(".");
      const ext = dot >= 0 ? base.slice(dot).toLowerCase() : "";
      if (SKIP_EXT.has(ext)) continue;

      const abs = join(repo.path, rel);
      try {
        if (statSync(abs).size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }

      let content: string;
      try {
        const buf = readFileSync(abs);
        if (buf.includes(0)) continue; // binary file (contains a NUL byte)
        content = buf.toString("utf8");
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (ALLOWLIST.some((a) => line.includes(a))) continue;
        if (i > 0 && IGNORE_NEXT_LINE.test(lines[i - 1])) continue;
        for (const pattern of SECRET_PATTERNS) {
          const global = new RegExp(
            pattern.regex.source,
            pattern.regex.flags.includes("g")
              ? pattern.regex.flags
              : pattern.regex.flags + "g",
          );
          // Suppress only if EVERY match on the line is structurally fake —
          // a real token next to a fixture token must still fire.
          let realMatch = false;
          for (const m of line.matchAll(global)) {
            if (isFixtureSecret(m[0])) continue;
            if (
              pattern.name === "private key block" &&
              isDocOrFixturePrivateKeyLine(line)
            ) {
              continue;
            }
            realMatch = true;
            break;
          }
          if (realMatch) {
            findings.push({
              checkId: "secret-scan",
              severity: "security",
              message: `Possible ${pattern.name} committed to source.`,
              file: rel,
              line: i + 1,
              meta: { pattern: pattern.name },
            });
          }
        }
      }
    }
    return findings;
  },
};
