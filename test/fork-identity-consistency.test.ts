import { describe, it, expect } from "vitest";
import {
  parseSstIdentity,
  assessWorkflowFilters,
  assessRobotsHosts,
} from "../src/checks/universal/fork-identity-consistency.js";

const SST_TRUCKS_SHAPE = `
export default $config({
  app(input) {
    return { name: "trucks-law", removal: "retain", home: "aws" };
  },
  async run() {
    new sst.aws.Nextjs("Site", {
      openNextVersion: "4.0.2",
      domain: { name: "trucks.law", aliases: ["www.trucks.law"] },
    });
  },
});
`;

const SST_NO_DOMAIN = `
export default $config({
  app(input) { return { name: "internal-tool" }; },
  async run() { new sst.aws.Nextjs("Site", {}); },
});
`;

describe("parseSstIdentity", () => {
  it("takes the first dotless name as the app and dotted literals as domains", () => {
    const id = parseSstIdentity(SST_TRUCKS_SHAPE);
    expect(id.app).toBe("trucks-law");
    expect(id.domains).toContain("trucks.law");
    // www. collapses to the apex rather than a second identity
    expect(id.domains).not.toContain("www.trucks.law");
  });

  it("ignores cloudfront hosts and copes with a domainless config", () => {
    const id = parseSstIdentity(
      SST_NO_DOMAIN + `const staging = "d392fuyhjce176.cloudfront.net";`,
    );
    expect(id.app).toBe("internal-tool");
    expect(id.domains).toEqual([]);
  });
});

describe("assessWorkflowFilters — the thebiggestcases incident", () => {
  const INCIDENT = {
    ".github/workflows/deploy-staging.yml": `
      - name: invalidate
        run: |
          aws resourcegroupstaggingapi get-resources \\
            --tag-filters "Key=sst:app,Values=mesothelioma-claims-lawyers" \\
            --resource-type-filters cloudfront:distribution
    `,
  };

  it("fires when a workflow tag-filters another app's name", () => {
    const f = assessWorkflowFilters("thebiggestcases", INCIDENT);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("error");
    expect(f[0].message).toContain("mesothelioma-claims-lawyers");
    expect(f[0].message).toContain("thebiggestcases");
    expect(f[0].file).toContain("deploy-staging.yml");
  });

  it("is silent on a filter naming this repo's own app", () => {
    const fixed = {
      "wf.yml": `--tag-filters "Key=sst:app,Values=thebiggestcases"`,
    };
    expect(assessWorkflowFilters("thebiggestcases", fixed)).toHaveLength(0);
  });

  it("produces nothing when no workflow mentions sst:app — absence is not a defect fleet-wide", () => {
    const none = { "ci.yml": "run: pnpm test" };
    expect(assessWorkflowFilters("anything", none)).toHaveLength(0);
  });
});

describe("assessRobotsHosts — the afterloss-atlas incident", () => {
  it("fires when robots names a host outside the declared domains", () => {
    const f = assessRobotsHosts(["afterlossatlas.com"], {
      "src/app/robots.ts": `sitemap: "https://roofingtechpro.com/sitemap.xml", host: "https://roofingtechpro.com"`,
    });
    expect(f).toHaveLength(2);
    expect(f[0].message).toContain("roofingtechpro.com");
    expect(f[0].message).toContain("afterlossatlas.com");
  });

  it("accepts the declared domain, its subdomains, cloudfront and localhost", () => {
    const f = assessRobotsHosts(["afterlossatlas.com"], {
      "public/robots.txt": [
        "Sitemap: https://afterlossatlas.com/sitemap.xml",
        "Sitemap: https://www.afterlossatlas.com/sitemap.xml",
        "# staging: https://d123abc.cloudfront.net/",
        "# dev: http://localhost:3000/",
      ].join("\n"),
    });
    expect(f).toHaveLength(0);
  });

  it("does nothing when the config declares no domain — there is no truth to compare against", () => {
    const f = assessRobotsHosts([], {
      "src/app/robots.ts": `host: "https://anything.example"`,
    });
    expect(f).toHaveLength(0);
  });

  it("does nothing when robots derives its host — no literal, no scan", () => {
    const f = assessRobotsHosts(["afterlossatlas.com"], {
      "src/app/robots.ts": "export default () => robotsFor(siteConfig.url)",
    });
    expect(f).toHaveLength(0);
  });

  it("ignores a foreign host inside a .ts comment but still flags one in a live string", () => {
    // roxspa's robots.ts docblock cites another site's production robots as
    // evidence — provenance, not residue. The same host in shipped code is.
    const commented = `
      // Confirmed in production on https://signaturedentistry.com.au/robots.txt
      export const host = "https://roxspabydrcalvert.com";
    `;
    expect(
      assessRobotsHosts(["roxspabydrcalvert.com"], { "src/app/robots.ts": commented }),
    ).toHaveLength(0);
    const live = `export const host = "https://signaturedentistry.com.au";`;
    expect(
      assessRobotsHosts(["roxspabydrcalvert.com"], { "src/app/robots.ts": live }),
    ).toHaveLength(1);
  });

  it("does not mistake version strings for declared domains", () => {
    const id = parseSstIdentity(
      `app(){return {name:"x-site"}} new sst.aws.Nextjs("S",{openNextVersion:"4.0.2",domain:{name:"x-site.com"}})`,
    );
    expect(id.domains).toEqual(["x-site.com"]);
  });
});
