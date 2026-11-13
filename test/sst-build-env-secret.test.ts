import { describe, it, expect } from "vitest";
import {
  readBuildEnv,
  sstBuildEnvSecret,
  sstConfigFiles,
} from "../src/checks/universal/sst-build-env-secret.js";
import { allChecks } from "../src/checks/index.js";
import { fixtureCtx } from "./helpers.js";

const wrap = (body: string, pre = ""): string =>
  `${pre}\nexport default $config({ app() { return { name: "x", home: "aws" }; }, async run() {\n${body}\n} });`;

const FORM_A =
  'const command = await import("@pulumi/command");\n' +
  "$transform(command.local.Command, (args) => { if (args.environment) args.environment = $util.secret(args.environment); });";
const FORM_B =
  "$util.runtime.registerStackTransformation((resource: any) => {\n" +
  '  if (resource.type !== "command:local:Command" || !resource.props?.environment) return undefined;\n' +
  "  resource.props.environment = $util.secret(resource.props.environment);\n" +
  "  return { props: resource.props, opts: resource.opts };\n});";
const SITE = 'new sst.aws.Nextjs("S", {});';

describe("readBuildEnv: the sites", () => {
  it("finds every class that builds through the SSR builder", () => {
    const names = ["Nextjs", "Astro", "Remix", "SvelteKit", "SolidStart", "Nuxt", "React", "TanStackStart", "Analog"];
    const read = readBuildEnv(wrap(names.map((n) => `new sst.aws.${n}("S${n}", {});`).join("\n")));
    expect(read.sites.map((s) => s.component)).toEqual(names);
  });

  it("does not count a static site, a function, or a class of the same name outside sst", () => {
    const read = readBuildEnv(
      wrap('new sst.aws.StaticSite("S", {}); new sst.aws.Function("F", {}); new other.aws.Nextjs("N", {}); new React("R");'),
    );
    expect(read.sites).toEqual([]);
  });

  it("does not count a site named only in a comment or a string", () => {
    const read = readBuildEnv(wrap('// new sst.aws.Nextjs("S", {});\nconst note = "new sst.aws.Nextjs(…)";'));
    expect(read.sites).toEqual([]);
  });
});

describe("readBuildEnv: the transformation", () => {
  it("recognises the $transform form, with the guard and without it", () => {
    expect(readBuildEnv(wrap(`${FORM_A}\n${SITE}`)).transforms).toEqual([{ form: "transform", line: 4 }]);
    const bare = "$transform(local.Command, (args) => { args.environment = $util.secret(args.environment); });";
    expect(readBuildEnv(wrap(`${bare}\n${SITE}`)).transforms.map((t) => t.form)).toEqual(["transform"]);
  });

  it("recognises the registerStackTransformation form", () => {
    expect(readBuildEnv(wrap(`${FORM_B}\n${SITE}`)).transforms.map((t) => t.form)).toEqual(["stack"]);
  });

  it("recognises pulumi.secret and a function expression callback", () => {
    const src = "$transform(command.local.Command, function (args) { args.environment = pulumi.secret(args.environment); });";
    expect(readBuildEnv(wrap(`${src}\n${SITE}`)).transforms).toHaveLength(1);
  });

  it("does not count a transformation of another resource", () => {
    const src =
      "$transform(aws.cloudfront.Distribution, (args) => { args.isIpv6Enabled = true; });\n" +
      "$transform(aws.lambda.Function, (args) => { args.environment = $util.secret(args.environment); });";
    expect(readBuildEnv(wrap(`${src}\n${SITE}`)).transforms).toEqual([]);
  });

  it("does not count a Command transformation that leaves the environment plain", () => {
    const src =
      "$transform(command.local.Command, (args) => { args.triggers = [Date.now()]; });\n" +
      "$transform(command.local.Command, (args) => { args.environment = { ...args.environment, CI: \"1\" }; });";
    expect(readBuildEnv(wrap(`${src}\n${SITE}`)).transforms).toEqual([]);
  });

  it("does not count a stack transformation of another type, or one that sets nothing secret", () => {
    const other =
      '$util.runtime.registerStackTransformation((r: any) => { if (r.type !== "aws:s3/bucket:Bucket") return undefined; r.props.environment = $util.secret(r.props.environment); return r; });';
    const plain =
      '$util.runtime.registerStackTransformation((r: any) => { if (r.type !== "command:local:Command") return undefined; return { props: r.props, opts: r.opts }; });';
    expect(readBuildEnv(wrap(`${other}\n${plain}\n${SITE}`)).transforms).toEqual([]);
  });

  it("does not count the transformation when it is only in a comment", () => {
    const src = "// $transform(command.local.Command, (args) => { args.environment = $util.secret(args.environment); });";
    expect(readBuildEnv(wrap(`${src}\n${SITE}`)).transforms).toEqual([]);
  });
});

describe("readBuildEnv: order", () => {
  it("marks a transformation registered after a site in the same function", () => {
    const read = readBuildEnv(wrap(`${SITE}\n${FORM_A}`));
    expect(read.transforms).toEqual([{ form: "transform", line: 5, after: { component: "Nextjs", line: 3 } }]);
  });

  it("does not judge order across functions: a helper above run() runs after it", () => {
    const helper = 'function makeSite() { return new sst.aws.Nextjs("S", {}); }';
    const read = readBuildEnv(wrap(`${FORM_A}\nmakeSite();`, helper));
    expect(read.sites).toHaveLength(1);
    expect(read.transforms[0].after).toBeUndefined();
  });
});

describe("sstConfigFiles", () => {
  it("finds the root config and a config one directory down, and nothing in a repo without one", () => {
    expect(sstConfigFiles(fixtureCtx("build-env-clean").path)).toEqual(["sst.config.ts"]);
    expect(sstConfigFiles(fixtureCtx("build-env-subdir").path)).toEqual(["app/sst.config.ts"]);
    expect(sstConfigFiles(fixtureCtx("secret-clean").path)).toEqual([]);
  });
});

describe("sstBuildEnvSecret check", () => {
  it("is registered", () => {
    expect(allChecks.map((c) => c.id)).toContain("sst-build-env-secret");
  });

  it("applies only to repos with an sst.config.ts", () => {
    expect(sstBuildEnvSecret.appliesTo(fixtureCtx("build-env-dirty"))).toBe(true);
    expect(sstBuildEnvSecret.appliesTo(fixtureCtx("build-env-subdir"))).toBe(true);
    expect(sstBuildEnvSecret.appliesTo(fixtureCtx("secret-clean"))).toBe(false);
  });

  it("fires on the fleet shape before the wave: an SSR site and no transformation", async () => {
    const findings = await sstBuildEnvSecret.run(fixtureCtx("build-env-dirty"));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: "sst-build-env-secret", severity: "warning", file: "sst.config.ts", line: 9 });
    expect(findings[0].message).toContain("$transform(command.local.Command");
    expect(findings[0].message).toContain("plaintext");
  });

  it("fires on a config one directory down", async () => {
    const findings = await sstBuildEnvSecret.run(fixtureCtx("build-env-subdir"));
    expect(findings.map((f) => f.file)).toEqual(["app/sst.config.ts"]);
  });

  it("fires when the transformation comes after the site it should cover", async () => {
    const findings = await sstBuildEnvSecret.run(fixtureCtx("build-env-late"));
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(10);
    expect(findings[0].message).toContain("registered after sst.aws.Nextjs is created (line 8)");
  });

  it("is silent on both forms of the fix", async () => {
    expect(await sstBuildEnvSecret.run(fixtureCtx("build-env-clean"))).toEqual([]);
    expect(await sstBuildEnvSecret.run(fixtureCtx("build-env-variant"))).toEqual([]);
  });

  it("is silent on a static builder and a function-only stack", async () => {
    expect(await sstBuildEnvSecret.run(fixtureCtx("build-env-static"))).toEqual([]);
  });
});
