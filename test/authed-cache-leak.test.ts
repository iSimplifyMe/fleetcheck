import { describe, it, expect } from "vitest";
import { authedCacheLeak } from "../src/checks/next/authed-cache-leak.js";
import { fixtureCtx } from "./helpers.js";

describe("authed-cache-leak", () => {
  it("fires on the VB incident shape: generator + ISR + unproven pages behind a middleware gate", async () => {
    const findings = await authedCacheLeak.run(fixtureCtx("acl-incident", "next"));

    const security = findings.filter((f) => f.severity === "security");
    const warnings = findings.filter((f) => f.severity === "warning");

    // /property/[file]: generateStaticParams — fires even though force-dynamic
    // is ALSO present (the generator wins; measured in the incident).
    const generator = security.find((f) => f.file?.includes("property"));
    expect(generator).toBeDefined();
    expect(generator!.message).toContain("generateStaticParams");
    expect(generator!.message).toContain("generator wins");

    // /budget: revalidate = 300 → ISR of an authed render.
    const isr = security.find((f) => f.file?.includes("budget"));
    expect(isr).toBeDefined();
    expect(isr!.message).toContain("revalidate = 300");

    // /portfolio: no dynamic proof anywhere in the tree. /settings: a
    // CONDITIONAL redirect that still renders markup is NOT the bare-redirect
    // safe shape — it warns too.
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.file).sort().join()).toContain("portfolio");
    expect(warnings.map((w) => w.file).sort().join()).toContain("settings");

    // /login is public — never flagged.
    expect(findings.some((f) => f.file?.includes("login"))).toBe(false);

    expect(security).toHaveLength(2);
  });

  it("is silent on the hardened shape (force-dynamic layout, no generator, bare-redirect root)", async () => {
    // Includes app/page.tsx = a bare redirect() with no JSX — renders no data,
    // so the warning layer must not fire on it (vb-app root-page shape).
    const findings = await authedCacheLeak.run(fixtureCtx("acl-hardened", "next"));
    expect(findings).toHaveLength(0);
  });

  it("component-gated trees: session read is the dynamic proof; static markers still fire", async () => {
    const findings = await authedCacheLeak.run(fixtureCtx("acl-component", "next"));

    // leads/ under requireAuth layout: implicitly dynamic — no warning layer at all.
    expect(findings.filter((f) => f.severity === "warning")).toHaveLength(0);

    // analytics/ declares generateStaticParams inside the gated tree → security.
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("security");
    expect(findings[0].file).toContain("analytics");

    // blog/ (revalidate, generator-free) sits OUTSIDE the session tree → not gated, silent.
    expect(findings.some((f) => f.file?.includes("blog"))).toBe(false);
  });

  it("is silent when middleware stamps no-store instead of cookie-gating (client-side-auth apps)", async () => {
    const findings = await authedCacheLeak.run(fixtureCtx("acl-nostore", "next"));
    expect(findings).toHaveLength(0);
  });

  it("does not classify a cookie-reading coming-soon gate as an auth gate (marketing sites)", async () => {
    const findings = await authedCacheLeak.run(fixtureCtx("acl-marketing", "next"));
    expect(findings).toHaveLength(0);
  });

  it("honors settings.publicRoutes to exempt repo-specific public segments", async () => {
    const ctx = {
      ...fixtureCtx("acl-incident", "next"),
      settings: { "authed-cache-leak": { publicRoutes: ["(portal)"] } },
    };
    const findings = await authedCacheLeak.run(ctx);
    expect(findings).toHaveLength(0);
  });

  it("applies only to Next.js repos", () => {
    expect(authedCacheLeak.appliesTo(fixtureCtx("acl-incident", "next"))).toBe(true);
    expect(authedCacheLeak.appliesTo(fixtureCtx("acl-incident", "other"))).toBe(false);
  });
});
