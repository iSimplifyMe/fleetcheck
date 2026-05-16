#!/usr/bin/env node
/** fleetcheck CLI — scan (fleet), check (single repo), report. fix lands in phase 8. */

import { parseArgs } from "node:util";
import { resolve, join, basename } from "node:path";
import { readFileSync } from "node:fs";
import { loadFleetConfig, classifyRepo } from "./fleet.js";
import { runChecks } from "./runner.js";
import { allChecks } from "./checks/index.js";
import { writeJsonReports } from "./reporters/json.js";
import { renderMatrix, writeMatrix } from "./reporters/markdown.js";
import type { ScanResult, Severity, Finding } from "./types.js";

function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

function summarize(findings: Finding[]): string {
  const c: Record<Severity, number> = { security: 0, error: 0, warning: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  if (c.security + c.error + c.warning + c.info === 0) return "clean";
  return `${c.security}S ${c.error}E ${c.warning}W ${c.info}I`;
}

async function cmdScan(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string", default: "fleet.config.json" },
      root: { type: "string", default: process.cwd() },
      repo: { type: "string" },
      out: { type: "string", default: "reports" },
      "fail-on": { type: "string" },
    },
  });

  const config = loadFleetConfig(values.config as string);
  let entries = config.repos.filter((r) => !r.skip);
  if (values.repo) entries = entries.filter((r) => r.name === values.repo);

  if (entries.length === 0) {
    log("No repos to scan (check --repo / --config / skip flags).");
    process.exitCode = 1;
    return;
  }

  const root = values.root as string;
  log(
    `fleetcheck: scanning ${entries.length} repo(s) with ${allChecks.length} check(s) ` +
      `under ${root}`,
  );
  const results = [];
  for (const entry of entries) {
    const ctx = classifyRepo(entry, root);
    const result = await runChecks(ctx, allChecks);
    log(`  ${entry.name} [${ctx.kind}] — ${summarize(result.findings)}`);
    results.push(result);
  }

  const scan: ScanResult = { generatedAt: new Date().toISOString(), repos: results };
  const outDir = resolve(values.out as string);
  writeJsonReports(scan, outDir);
  writeMatrix(scan, outDir);
  log(`\nReports written to ${outDir}/ (scan.json, fleet-health-matrix.md, <repo>.json)`);

  if (values["fail-on"]) {
    const order: Severity[] = ["security", "error", "warning", "info"];
    const threshold = order.indexOf(values["fail-on"] as Severity);
    if (threshold >= 0) {
      const hit = scan.repos.some((r) =>
        r.findings.some((f) => order.indexOf(f.severity) <= threshold),
      );
      if (hit) process.exitCode = 2;
    }
  }
}

function cmdReport(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: { out: { type: "string", default: "reports" } },
  });
  const outDir = resolve(values.out as string);
  const scan = JSON.parse(readFileSync(join(outDir, "scan.json"), "utf8")) as ScanResult;
  writeMatrix(scan, outDir);
  process.stdout.write(renderMatrix(scan) + "\n");
}

async function cmdCheck(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "fail-on": { type: "string", default: "error" },
      json: { type: "boolean", default: false },
    },
  });
  const target = resolve(positionals[0] ?? process.cwd());
  const ctx = classifyRepo({ name: basename(target), path: target }, target);
  const result = await runChecks(ctx, allChecks);
  const order: Severity[] = ["security", "error", "warning", "info"];

  if (values.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    log(`fleetcheck: ${ctx.name} [${ctx.kind}] — ${summarize(result.findings)}`);
    const sorted = [...result.findings].sort(
      (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
    );
    for (const f of sorted) {
      const loc = f.file ? ` ${f.file}${f.line ? ":" + f.line : ""}` : "";
      log(`  [${f.severity}] ${f.checkId}${loc} — ${f.message}`);
    }
    for (const [id, err] of Object.entries(result.errors)) {
      log(`  [check-error] ${id}: ${err}`);
    }
  }

  const threshold = order.indexOf(values["fail-on"] as Severity);
  if (
    threshold >= 0 &&
    result.findings.some((f) => order.indexOf(f.severity) <= threshold)
  ) {
    process.exitCode = 2;
  }
}

function usage(): void {
  log("usage: fleetcheck <command> [options]");
  log("");
  log("  scan     --config <path> --root <dir> [--repo <name>] [--out <dir>] [--fail-on <sev>]");
  log("  check    [path] [--fail-on <severity>] [--json]   — single repo, for CI");
  log("  report   [--out <dir>]");
  log("");
  log("  scan --root defaults to the current directory; repo path = <root>/<name>.");
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "scan":
    await cmdScan(rest);
    break;
  case "check":
    await cmdCheck(rest);
    break;
  case "report":
    cmdReport(rest);
    break;
  case undefined:
  case "help":
  case "--help":
  case "-h":
    usage();
    break;
  default:
    log(`unknown command: ${cmd}`);
    usage();
    process.exitCode = 1;
}
