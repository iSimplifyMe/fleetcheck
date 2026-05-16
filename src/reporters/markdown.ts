/** Markdown reporter: the fleet health & security matrix. */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ScanResult, RepoResult, Severity } from "../types.js";

const SEV_EMOJI: Record<Severity, string> = {
  security: "🔴",
  error: "🟠",
  warning: "🟡",
  info: "⚪",
};

const SEV_RANK: Record<Severity, number> = {
  security: 0,
  error: 1,
  warning: 2,
  info: 3,
};

function counts(repo: RepoResult): Record<Severity, number> {
  const c: Record<Severity, number> = { security: 0, error: 0, warning: 0, info: 0 };
  for (const f of repo.findings) c[f.severity]++;
  return c;
}

function statusOf(c: Record<Severity, number>): string {
  if (c.security > 0) return "SECURITY";
  if (c.error > 0) return "ERROR";
  if (c.warning > 0) return "warn";
  return "clean";
}

function repoRank(repo: RepoResult): number {
  const c = counts(repo);
  return c.security * 1_000_000 + c.error * 1_000 + c.warning;
}

export function renderMatrix(scan: ScanResult): string {
  const out: string[] = [];
  const repos = [...scan.repos].sort((a, b) => repoRank(b) - repoRank(a));

  const total: Record<Severity, number> = { security: 0, error: 0, warning: 0, info: 0 };
  let fixable = 0;
  for (const r of scan.repos) {
    for (const f of r.findings) {
      total[f.severity]++;
      if (f.fixable) fixable++;
    }
  }

  out.push("# Fleet Health & Security Matrix");
  out.push("");
  out.push(`Generated: ${scan.generatedAt}`);
  out.push("");
  out.push(
    `**${scan.repos.length}** repos scanned — ` +
      `🔴 ${total.security} security · 🟠 ${total.error} error · ` +
      `🟡 ${total.warning} warning · ⚪ ${total.info} info · ` +
      `🔧 ${fixable} auto-fixable`,
  );
  out.push("");

  // ---- Matrix table ----
  out.push("## Matrix");
  out.push("");
  out.push("| Repo | Kind | 🔴 | 🟠 | 🟡 | ⚪ | Status |");
  out.push("|------|------|---:|---:|---:|---:|--------|");
  const cell = (n: number): string => (n > 0 ? String(n) : "·");
  for (const r of repos) {
    const c = counts(r);
    out.push(
      `| ${r.repo} | ${r.kind} | ${cell(c.security)} | ${cell(c.error)} | ` +
        `${cell(c.warning)} | ${cell(c.info)} | ${statusOf(c)} |`,
    );
  }
  out.push("");

  // ---- Findings by check ----
  const byCheck = new Map<
    string,
    { severity: Severity; count: number; repos: Set<string> }
  >();
  for (const r of scan.repos) {
    for (const f of r.findings) {
      const e =
        byCheck.get(f.checkId) ??
        { severity: f.severity, count: 0, repos: new Set<string>() };
      e.count++;
      e.repos.add(r.repo);
      if (SEV_RANK[f.severity] < SEV_RANK[e.severity]) e.severity = f.severity;
      byCheck.set(f.checkId, e);
    }
  }
  if (byCheck.size > 0) {
    out.push("## Findings by check");
    out.push("");
    out.push("| Check | Severity | Findings | Repos affected |");
    out.push("|-------|----------|---------:|---------------:|");
    const rows = [...byCheck.entries()].sort(
      (a, b) =>
        SEV_RANK[a[1].severity] - SEV_RANK[b[1].severity] || b[1].count - a[1].count,
    );
    for (const [id, e] of rows) {
      out.push(
        `| \`${id}\` | ${SEV_EMOJI[e.severity]} ${e.severity} | ${e.count} | ${e.repos.size} |`,
      );
    }
    out.push("");
  }

  // ---- Per-repo detail ----
  out.push("## Detail");
  out.push("");
  let anyDetail = false;
  for (const r of repos) {
    if (r.findings.length === 0 && Object.keys(r.errors).length === 0) continue;
    anyDetail = true;
    const c = counts(r);
    out.push(`### ${r.repo} — ${statusOf(c)}`);
    out.push("");
    const sorted = [...r.findings].sort(
      (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity],
    );
    for (const f of sorted) {
      const loc = f.file ? ` \`${f.file}${f.line ? ":" + f.line : ""}\`` : "";
      const fix = f.fixable ? " 🔧" : "";
      out.push(`- ${SEV_EMOJI[f.severity]} **${f.checkId}**${fix} — ${f.message}${loc}`);
    }
    for (const [checkId, err] of Object.entries(r.errors)) {
      out.push(`- ⚠️ check \`${checkId}\` failed to run: ${err}`);
    }
    out.push("");
  }
  if (!anyDetail) {
    out.push("_No findings across the fleet._");
    out.push("");
  }

  return out.join("\n");
}

export function writeMatrix(scan: ScanResult, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "fleet-health-matrix.md"), renderMatrix(scan));
}
