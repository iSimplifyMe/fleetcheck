import { describe, it, expect } from "vitest";
import {
  secretScan,
  isFixtureSecret,
  isDocOrFixturePrivateKeyLine,
} from "../src/checks/universal/secret-scan.js";
import { fixtureCtx } from "./helpers.js";

describe("secret-scan", () => {
  it("flags a committed AWS access key id", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-dirty"));
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("secret-scan");
    expect(findings[0].severity).toBe("security");
    expect(findings[0].file).toContain("config.ts");
    expect(findings[0].line).toBe(2);
  });

  it("reports nothing for a repo with no secrets", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-clean"));
    expect(findings).toHaveLength(0);
  });

  it("does not scan inside .claude/ agent-worktree directories", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-in-claude-dir"));
    expect(findings).toHaveLength(0);
  });
});

describe("secret-scan suppressions (2026-07-16 baseline false-positive classes)", () => {
  it("classifies delimited fixture segments, and only those, as fake", () => {
    expect(isFixtureSecret("xoxb-test-token")).toBe(true);
    expect(isFixtureSecret("xoxb-fake-1234567890")).toBe(true);
    // Real-shaped values never qualify — numeric segments, no marker words.
    expect(isFixtureSecret("xoxb-123456789012-1234567890123-AbCdEfGh")).toBe(false);
    // Delimiter-free charsets (AWS/CF/Stripe/GitHub) can never be suppressed,
    // even when the letters happen to spell a marker.
    expect(isFixtureSecret("AKIAZ9LMQ4T7XPB2TEST")).toBe(false);
    expect(isFixtureSecret("cfut_testAb1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9")).toBe(false);
  });

  it("classifies doc-prose and no-room-for-key-material PEM lines", () => {
    // The three getvesper-site shapes (backtick / ellipsis doc mentions):
    expect(
      isDocOrFixturePrivateKeyLine(
        " * - WEATHERKIT_PRIVATE_KEY  full `.p8` file contents (`-----BEGIN PRIVATE KEY-----...`)",
      ),
    ).toBe(true);
    expect(
      isDocOrFixturePrivateKeyLine(
        "including the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines",
      ),
    ).toBe(true);
    // The weather-app single-line fixture (same-line END, 8 chars between):
    expect(
      isDocOrFixturePrivateKeyLine(
        'mock.value = "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----";',
      ),
    ).toBe(true);
    // A real BEGIN header line (key body follows on the NEXT lines) still fires:
    expect(isDocOrFixturePrivateKeyLine("-----BEGIN PRIVATE KEY-----")).toBe(false);
    expect(isDocOrFixturePrivateKeyLine('const k = "-----BEGIN PRIVATE KEY-----')).toBe(false);
  });

  it("suppresses the fixture/doc/escaped shapes end to end", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-suppressed"));
    expect(findings).toEqual([]);
  });

  it("still fires on real-shaped credentials in test dirs — suppression is never path-based", async () => {
    const findings = await secretScan.run(fixtureCtx("secret-real-in-tests"));
    const located = findings.map((f) => `${f.file}:${f.line}`).sort();
    expect(located).toEqual([
      "__tests__/handler.ts:3", // AWS key id
      "__tests__/handler.ts:4", // Cloudflare token
      "__tests__/handler.ts:5", // Slack token (numeric segments = real-shaped)
      "__tests__/handler.ts:7", // directive without a reason is inert
      "docs/leaked.md:3", // multi-line PEM BEGIN header
    ]);
    for (const f of findings) expect(f.severity).toBe("security");
  });
});
