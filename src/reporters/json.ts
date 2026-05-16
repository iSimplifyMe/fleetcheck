/** JSON reporters: one aggregate file plus one file per repo. */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ScanResult } from "../types.js";

export function writeJsonReports(scan: ScanResult, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "scan.json"), JSON.stringify(scan, null, 2) + "\n");
  for (const repo of scan.repos) {
    writeFileSync(
      join(outDir, `${repo.repo}.json`),
      JSON.stringify(repo, null, 2) + "\n",
    );
  }
}
