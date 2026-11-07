import { describe, it, expect } from "vitest";
import {
  definedEnvNames,
  deployLine,
  isDispatchOnly,
  isProductionDeploy,
  parseTriggers,
} from "../src/checks/workflow-lib.js";

describe("workflow-lib: parseTriggers", () => {
  it("reads a block mapping", () => {
    expect(parseTriggers("name: x\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\njobs: {}"))
      .toEqual(["push", "workflow_dispatch"]);
  });
  it("reads a flow sequence and a scalar", () => {
    expect(parseTriggers("on: [push, workflow_dispatch]\n")).toEqual(["push", "workflow_dispatch"]);
    expect(parseTriggers("on: workflow_dispatch\n")).toEqual(["workflow_dispatch"]);
  });
  it("ignores comments and deeper keys", () => {
    expect(parseTriggers("on:\n  # by hand only\n  workflow_dispatch:\n    inputs:\n      stage:\n        type: string\n"))
      .toEqual(["workflow_dispatch"]);
  });
});

describe("workflow-lib: isDispatchOnly", () => {
  it("is true only when workflow_dispatch is the sole trigger", () => {
    expect(isDispatchOnly(["workflow_dispatch"])).toBe(true);
    expect(isDispatchOnly(["push", "workflow_dispatch"])).toBe(false);
    expect(isDispatchOnly([])).toBe(false);
  });
});

describe("workflow-lib: isProductionDeploy", () => {
  it("accepts a literal production stage through any runner", () => {
    expect(isProductionDeploy("run: npx sst deploy --stage production")).toBe(true);
    expect(isProductionDeploy("run: pnpm exec sst deploy --stage=production")).toBe(true);
  });
  it("accepts a stage chosen at run time (it can be production)", () => {
    expect(isProductionDeploy("run: npx sst deploy --stage ${{ inputs.stage }}")).toBe(true);
    expect(isProductionDeploy("run: npx sst ${{ inputs.sst_action }} --stage production")).toBe(true);
  });
  it("rejects staging-only and non-sst workflows", () => {
    expect(isProductionDeploy("run: npx sst deploy --stage staging")).toBe(false);
    expect(isProductionDeploy("run: npm test\n# production")).toBe(false);
  });
});

describe("workflow-lib: definedEnvNames / deployLine", () => {
  it("collects UPPER_SNAKE mapping keys and run-line assignments, not YAML keys", () => {
    const names = definedEnvNames(
      "jobs:\n  deploy:\n    env:\n      CF_ZONE_X: abc\n    steps:\n      - run: SHARP_VERSION=0.35.4 npx sst deploy --stage production\n",
    );
    expect([...names].sort()).toEqual(["CF_ZONE_X", "SHARP_VERSION"]);
  });
  it("finds the deploy line", () => {
    expect(deployLine("a\nb\n      - run: npx sst deploy --stage production\n")).toBe(3);
    expect(deployLine("run: npm test")).toBeUndefined();
  });
});
