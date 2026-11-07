/// <reference path="./.sst/platform/config.d.ts" />
const CF_ZONE = process.env.CF_ZONE_EXAMPLE || "";

export default $config({
  app(input) {
    return { name: "example", home: "aws" };
  },
  async run() {
    const isProduction = $app.stage === "production";
    if (isProduction && !CF_ZONE) {
      throw new Error("CF_ZONE_EXAMPLE is required for a production deploy");
    }
    new sst.aws.Nextjs("Site", {
      domain: isProduction && CF_ZONE
        ? { name: "example.com", dns: sst.cloudflare.dns({ zone: CF_ZONE }) }
        : undefined,
    });
  },
});
