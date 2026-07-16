import { describe, it, expect } from "vitest";
import {
  sstSecretFallback,
  sstSecretFallbackHits,
  isAllowlistedEnvVar,
  looksSecret,
} from "../src/checks/universal/sst-secret-fallback.js";
import { fixtureCtx } from "./helpers.js";

describe("sstSecretFallbackHits", () => {
  it("flags empty-string fallbacks on secret-looking env reads (April incident pattern)", () => {
    expect(
      sstSecretFallbackHits('AUTH_SECRET: process.env.AUTH_SECRET || "",'),
    ).toEqual([{ kind: "fallback", name: "AUTH_SECRET", empty: true }]);
    expect(
      sstSecretFallbackHits("APEX_LEAD_SECRET: process.env.APEX_LEAD_SECRET ?? '',"),
    ).toEqual([{ kind: "fallback", name: "APEX_LEAD_SECRET", empty: true }]);
  });

  it("flags non-empty hardcoded fallbacks on secret-looking reads", () => {
    expect(
      sstSecretFallbackHits(
        'JWT_SIGNING_KEY: process.env.JWT_SIGNING_KEY || "dev-signing-key",',
      ),
    ).toEqual([{ kind: "fallback", name: "JWT_SIGNING_KEY", empty: false }]);
  });

  it("flags direct secret literals", () => {
    expect(
      sstSecretFallbackHits('        STRIPE_WEBHOOK_SECRET: "whsec_1234567890abcdef",'),
    ).toEqual([{ kind: "literal", name: "STRIPE_WEBHOOK_SECRET" }]);
  });

  it("passes allowlisted infra vars and public-by-design values", () => {
    const legit = [
      'const cfZone = process.env.CF_ZONE_SCRIMMAGE || "";',
      "apiToken: process.env.CLOUDFLARE_API_TOKEN,",
      'profile: process.env.GITHUB_ACTIONS ? undefined : "default",',
      'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",',
      'STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",',
      'AUTH_TRUST_URL: process.env.AUTH_TRUST_URL || "http://localhost:3000",',
    ];
    for (const line of legit) {
      expect(sstSecretFallbackHits(line), line).toEqual([]);
    }
  });

  it("passes non-secret config defaults", () => {
    const config = [
      'CONTACT_FORM_TO: process.env.CONTACT_FORM_TO || "contact@example.com",',
      'PLATFORM_FEE_PERCENT: process.env.PLATFORM_FEE_PERCENT || "0.4",',
      'CLEARINGHOUSE_PROVIDER: process.env.CLEARINGHOUSE_PROVIDER || "mock",',
      'ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || "HqZ8v5kEEGamcA6Wr1gc",',
    ];
    for (const line of config) {
      expect(sstSecretFallbackHits(line), line).toEqual([]);
    }
  });

  it("does not fire on the fleet's NEVER-do-this comment convention", () => {
    expect(
      sstSecretFallbackHits('// NEVER use `process.env.X || ""` for app secrets.'),
    ).toEqual([]);
  });

  it("passes Secrets Manager references and SSH public keys (migration-pilot FP classes)", () => {
    // The three apex-portal origin/main shapes the pilot flagged as false positives:
    const references = [
      '          WHM_SECRET_ID: "ism-fleet/whm-token",',
      '        SSH_SECRET_ID: "ism-fleet/fleet-runner-ssh-key",',
      '        WP_SSH_HOST_KEY: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICDzvd3C8i6bE9Ss769auM112B9Ivk/ThpgJ7s0CUvDQ", // host pubkey',
      // ARN values are identifiers regardless of the key name:
      '        DB_CREDS_SECRET_ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/db-AbC123",',
      '        AUTH_SECRET: "arn:aws:secretsmanager:us-east-1:123456789012:secret:auth-XyZ",',
      // …and in fallback position too:
      '        HOST_PUBKEY_PIN: process.env.HOST_PUBKEY_PIN || "ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB",',
    ];
    for (const line of references) {
      expect(sstSecretFallbackHits(line), line).toEqual([]);
    }
  });

  it("still fires on real secret values next to the suppressed classes", () => {
    // The April incident shape is unaffected by the pilot suppressions:
    expect(
      sstSecretFallbackHits('AUTH_SECRET: process.env.AUTH_SECRET || "",'),
    ).toEqual([{ kind: "fallback", name: "AUTH_SECRET", empty: true }]);
    // A PRIVATE key literal is a secret value — only PUBLIC key shapes pass:
    expect(
      sstSecretFallbackHits(
        'WP_SSH_PRIVATE_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----",',
      ),
    ).toEqual([{ kind: "literal", name: "WP_SSH_PRIVATE_KEY" }]);
    // Raw key material without a public-key type prefix still fires:
    expect(
      sstSecretFallbackHits('GH_HOST_KEY: "AAAAC3NzaC1lZDI1NTE5AAAAICDzvd3C8i6b",'),
    ).toEqual([{ kind: "literal", name: "GH_HOST_KEY" }]);
    // A *_SECRET_ID-style suffix must be at the END to count as a reference:
    expect(
      sstSecretFallbackHits('SECRET_ID_TOKEN: process.env.SECRET_ID_TOKEN || "",'),
    ).toEqual([{ kind: "fallback", name: "SECRET_ID_TOKEN", empty: true }]);
  });
});

describe("allowlist and name heuristics", () => {
  it("allowlists infra and public prefixes/suffixes", () => {
    for (const name of [
      "AWS_REGION",
      "CLOUDFLARE_API_TOKEN",
      "CF_ZONE_LABREASTANDBODY",
      "GITHUB_ACTIONS",
      "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
      "STRIPE_PUBLISHABLE_KEY",
      "NEXTAUTH_URL",
      "WHM_SECRET_ID",
      "SSH_SECRET_ARN",
      "DB_CREDS_SECRET_NAME",
    ]) {
      expect(isAllowlistedEnvVar(name), name).toBe(true);
    }
    expect(isAllowlistedEnvVar("APEX_LEAD_SECRET")).toBe(false);
  });

  it("classifies secret-looking names", () => {
    for (const name of [
      "AUTH_SECRET",
      "GH_DEPLOY_TOKEN",
      "ELEVENLABS_API_KEY",
      "WEATHERKIT_PRIVATE_KEY",
      "TRACKING_HMAC_SECRET",
    ]) {
      expect(looksSecret(name), name).toBe(true);
    }
    for (const name of ["CONTACT_FORM_TO", "ALLOWED_EMAIL", "GA_ID", "SES_TO_EMAILS"]) {
      expect(looksSecret(name), name).toBe(false);
    }
  });
});

describe("sst-secret-fallback check", () => {
  it("applies only when sst.config.ts exists", () => {
    expect(sstSecretFallback.appliesTo(fixtureCtx("sst-fallback-dirty"))).toBe(true);
    expect(sstSecretFallback.appliesTo(fixtureCtx("secret-clean"))).toBe(false);
  });

  it("flags the three app-secret lines and nothing else in the dirty fixture", async () => {
    const findings = await sstSecretFallback.run(fixtureCtx("sst-fallback-dirty"));
    expect(findings).toHaveLength(3);
    for (const f of findings) {
      expect(f.checkId).toBe("sst-secret-fallback");
      expect(f.severity).toBe("security");
      expect(f.file).toBe("sst.config.ts");
      expect(f.message).toContain("sst.Secret");
    }
    expect(findings.map((f) => f.meta?.name)).toEqual([
      "AUTH_SECRET",
      "APEX_LEAD_SECRET",
      "STRIPE_WEBHOOK_SECRET",
    ]);
  });

  it("passes the sanctioned sst.Secret pattern", async () => {
    expect(await sstSecretFallback.run(fixtureCtx("sst-fallback-clean"))).toEqual([]);
  });
});
