import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findDomainGates, sstDomainEnvGate } from "../src/checks/universal/sst-domain-env-gate.js";
import { classifyRepo } from "../src/fleet.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const wrap = (body: string, pre = ""): string =>
  `${pre}\nexport default $config({ app() { return { name: "x", home: "aws" }; }, async run() {\n` +
  `const isProduction = $app.stage === "production";\n${body}\n} });`;

describe("findDomainGates", () => {
  it("finds the labreastandbody shape: env-derived identifier inside the condition", () => {
    const gates = findDomainGates(
      wrap(
        'new sst.aws.Nextjs("S", { domain: isProduction && CF_ZONE ? { name: "x.com" } : undefined });',
        'const CF_ZONE = process.env.CF_ZONE_X || "";',
      ),
    );
    expect(gates).toHaveLength(1);
    expect(gates[0].envNames).toEqual(["CF_ZONE_X"]);
    expect(gates[0].identifiers).toEqual(["CF_ZONE"]);
    expect(gates[0].guarded).toBe(false);
  });

  it("finds a bare identifier domain whose value is an env var with an empty fallback", () => {
    const gates = findDomainGates(
      wrap('new sst.aws.Nextjs("S", { domain: domainName });', 'const domainName = process.env.SITE_DOMAIN || "";'),
    );
    expect(gates.map((g) => g.envNames)).toEqual([["SITE_DOMAIN"]]);
  });

  it("finds a direct process.env condition and a destructured one", () => {
    expect(
      findDomainGates(wrap('new sst.aws.Nextjs("S", { domain: process.env.DOMAIN ? { name: process.env.DOMAIN } : undefined });'))[0].envNames,
    ).toEqual(["DOMAIN"]);
    expect(
      findDomainGates(wrap('new sst.aws.Nextjs("S", { domain: ZONE ? { name: "x.com" } : undefined });', "const { ZONE } = process.env;"))[0].envNames,
    ).toEqual(["ZONE"]);
  });

  it("follows provenance transitively through a derived boolean", () => {
    const gates = findDomainGates(
      wrap(
        'new sst.aws.Nextjs("S", { domain: armed ? { name: "x.com" } : undefined });',
        'const CF_ZONE = process.env.CF_ZONE_X || "";\nconst armed = Boolean(CF_ZONE);',
      ),
    );
    expect(gates[0].envNames).toEqual(["CF_ZONE_X"]);
  });

  it("is silent when the env var only feeds a value inside an existing domain", () => {
    expect(
      findDomainGates(wrap('new sst.aws.Nextjs("S", { domain: { name: process.env.DOMAIN || "x.com" } });')),
    ).toEqual([]);
  });

  it("is silent for stage-only conditions, nested or not, and for stage env vars", () => {
    expect(
      findDomainGates(
        wrap(
          'new sst.aws.Nextjs("S", { domain: $app.stage === "staging" ? { name: "p.x.com" } : isGo ? { name: GO_HOST } : undefined });',
          'const isGo = $app.stage === "go"; const GO_HOST = "go.x.com";',
        ),
      ),
    ).toEqual([]);
    expect(
      findDomainGates(
        wrap('new sst.aws.Nextjs("S", { domain: isProd ? { name: "x.com" } : undefined });', 'const stage = process.env.SST_STAGE; const isProd = stage === "production";'),
      ),
    ).toEqual([]);
  });

  it("marks a gate guarded when a throw names the variable", () => {
    const gates = findDomainGates(
      wrap(
        'if (isProduction && !CF_ZONE) throw new Error("CF_ZONE_X required");\nnew sst.aws.Nextjs("S", { domain: isProduction && CF_ZONE ? { name: "x.com" } : undefined });',
        'const CF_ZONE = process.env.CF_ZONE_X || "";',
      ),
    );
    expect(gates).toHaveLength(1);
    expect(gates[0].guarded).toBe(true);
  });
});

describe("sst-domain-env-gate check", () => {
  it("fires on the incident: prod workflow without the gating var + unguarded shape", async () => {
    const ctx = classifyRepo({ name: "domain-gate-dirty" }, fixtures);
    const findings = await sstDomainEnvGate.run(ctx);
    expect(findings).toHaveLength(2);
    const error = findings.find((f) => f.severity === "error");
    expect(error?.file).toBe(".github/workflows/deploy-production.yml");
    expect(error?.line).toBe(11);
    expect(error?.message).toContain("CF_ZONE_EXAMPLE");
    expect(error?.message).toContain("REMOVES the live DNS");
    const warning = findings.find((f) => f.severity === "warning");
    expect(warning?.file).toBe("sst.config.ts");
    expect(warning?.line).toBe(12);
    // the staging workflow lacks the var by design and must not be named
    expect(findings.some((f) => f.file?.includes("staging"))).toBe(false);
  });

  it("stays silent when the workflow sets the var and the config throws without it", async () => {
    const ctx = classifyRepo({ name: "domain-gate-clean" }, fixtures);
    expect(await sstDomainEnvGate.run(ctx)).toEqual([]);
  });

  it("does not apply without an sst.config.ts", () => {
    expect(sstDomainEnvGate.appliesTo(classifyRepo({ name: "secret-clean" }, fixtures))).toBe(false);
  });
});
