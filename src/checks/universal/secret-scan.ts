/**
 * secret-scan — flag credentials committed to source. Scans non-ignored files
 * (globby honors .gitignore, so gitignored env files are skipped) for common
 * provider key shapes.
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
        "**/dist/**",
        "**/.next/**",
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
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.regex.test(line)) {
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
