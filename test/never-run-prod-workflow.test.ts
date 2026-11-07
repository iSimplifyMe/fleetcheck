import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dispatchOnlyProductionWorkflows,
  neverRunProdWorkflow,
} from "../src/checks/universal/never-run-prod-workflow.js";
import { classifyRepo } from "../src/fleet.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("never-run-prod-workflow: candidates", () => {
  it("selects dispatch-only PRODUCTION deploys only", () => {
    const c = dispatchOnlyProductionWorkflows(resolve(fixtures, "domain-gate-dirty"));
    expect(c.map((w) => w.file)).toEqual([".github/workflows/deploy-production.yml"]);
  });
  it("skips a push-triggered production deploy and repos without workflows", () => {
    expect(dispatchOnlyProductionWorkflows(resolve(fixtures, "wf-repo"))).toEqual([]);
    expect(dispatchOnlyProductionWorkflows(resolve(fixtures, "secret-clean"))).toEqual([]);
  });
  it("skips a dispatch-only STAGING deploy", () => {
    const c = dispatchOnlyProductionWorkflows(resolve(fixtures, "domain-gate-clean"));
    expect(c.map((w) => w.file)).toEqual([".github/workflows/deploy-production.yml"]);
  });
});

describe("never-run-prod-workflow: run", () => {
  it("returns nothing without a slug or with the network disabled", async () => {
    const ctx = classifyRepo({ name: "domain-gate-dirty" }, fixtures);
    expect(await neverRunProdWorkflow.run(ctx)).toEqual([]);
    process.env.FLEETCHECK_NO_NETWORK = "1";
    try {
      expect(await neverRunProdWorkflow.run({ ...ctx, slug: "iSimplifyMe/example" })).toEqual([]);
    } finally {
      delete process.env.FLEETCHECK_NO_NETWORK;
    }
  });
});
