import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessOpenNextPin,
  opennextVersionPin,
  MIN_OPENNEXT,
} from "../src/checks/next/opennext-version-pin.js";
import { classifyRepo } from "../src/fleet.js";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const SST_NO_PIN = 'new sst.aws.Nextjs("Site", { domain: { name: "x.com" } });';
const SST_PINNED =
  'new sst.aws.Nextjs("Site", { openNextVersion: "4.0.2", domain: {} });';
const SST_OLD_PIN =
  'new sst.aws.Nextjs("Site", { openNextVersion: "3.9.1", domain: {} });';

describe("assessOpenNextPin", () => {
  it("requires the pin on Next 16+ deployed through sst.aws.Nextjs", () => {
    const a = assessOpenNextPin("16.2.10", SST_NO_PIN);
    expect(a.status).toBe("missing");
    expect(a.detail).toContain("/_next/image");
    expect(a.detail).toContain(MIN_OPENNEXT);
  });

  it("accepts a pin at or above the minimum", () => {
    expect(assessOpenNextPin("16.2.10", SST_PINNED).status).toBe("ok");
  });

  it("rejects a pin below the minimum", () => {
    const a = assessOpenNextPin("16.2.10", SST_OLD_PIN);
    expect(a.status).toBe("too-old");
    expect(a.pinned).toBe("3.9.1");
  });

  it("does not apply below Next 16 or without an effective version", () => {
    expect(assessOpenNextPin("15.5.18", SST_NO_PIN).status).toBe("not-next16");
    expect(assessOpenNextPin(null, SST_NO_PIN).status).toBe("not-next16");
  });

  it("does not apply without an sst.aws.Nextjs component", () => {
    expect(assessOpenNextPin("16.2.10", null).status).toBe("not-sst-nextjs");
    expect(assessOpenNextPin("16.2.10", "export default {};").status).toBe(
      "not-sst-nextjs",
    );
  });

  it("accepts an unparseable (dynamic) pin rather than guessing", () => {
    const cfg = 'new sst.aws.Nextjs("S", { openNextVersion: "latest" });';
    expect(assessOpenNextPin("16.2.10", cfg).status).toBe("ok");
  });
});

describe("opennext-version-pin check", () => {
  it("emits one error for an unpinned Next 16 SST repo", async () => {
    const ctx = classifyRepo({ name: "opennext-unpinned" }, fixtures);
    const findings = await opennextVersionPin.run(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("opennext-version-pin");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].file).toBe("sst.config.ts");
  });

  it("stays silent when the pin is present", async () => {
    const ctx = classifyRepo({ name: "opennext-pinned" }, fixtures);
    expect(await opennextVersionPin.run(ctx)).toEqual([]);
  });
});
