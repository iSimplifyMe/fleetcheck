/// <reference path="./.sst/platform/config.d.ts" />
// The 2026-11-07 shape: the zone id gates whether the domain exists at all.
const CF_ZONE = process.env.CF_ZONE_EXAMPLE || "";

export default $config({
  app(input) {
    return { name: "example", home: "aws" };
  },
  async run() {
    const isProduction = $app.stage === "production";
    new sst.aws.Nextjs("Site", {
      domain: isProduction && CF_ZONE
        ? { name: "example.com", dns: sst.cloudflare.dns({ zone: CF_ZONE }) }
        : undefined,
    });
  },
});
