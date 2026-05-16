import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findDeployWorkflows,
  isCredentialFailureLog,
} from "../src/checks/universal/stale-aws-creds.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("stale-aws-creds: findDeployWorkflows", () => {
  it("identifies deploy workflows and ignores non-deploy ones", () => {
    const wfs = findDeployWorkflows(resolve(here, "fixtures/wf-repo"));
    expect(wfs).toContain("deploy-production.yml");
    expect(wfs).not.toContain("ci.yml");
  });

  it("returns empty for a repo with no workflows", () => {
    const wfs = findDeployWorkflows(resolve(here, "fixtures/secret-clean"));
    expect(wfs).toEqual([]);
  });
});

describe("stale-aws-creds: isCredentialFailureLog", () => {
  it("detects AWS credential-expiry errors", () => {
    expect(
      isCredentialFailureLog(
        "Error: The security token included in the request is invalid",
      ),
    ).toBe(true);
    expect(isCredentialFailureLog("InvalidClientTokenId: bad token")).toBe(true);
    expect(isCredentialFailureLog("ExpiredToken: the token has expired")).toBe(true);
  });

  it("ignores unrelated build failures", () => {
    expect(isCredentialFailureLog("Error: TypeScript compilation failed")).toBe(false);
    expect(isCredentialFailureLog("npm ERR! 404 Not Found")).toBe(false);
  });
});
