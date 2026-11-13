/// <reference path="./.sst/platform/config.d.ts" />
// The fleet shape before the 2026-11-12 wave: an SSR site, no transformation.
export default $config({
  app(input) {
    return { name: "site", home: "aws", providers: { aws: { region: "us-east-1" }, cloudflare: "6.15.0" } };
  },
  async run() {
    $transform(aws.cloudfront.Distribution, (args) => { args.isIpv6Enabled = true; });
    const site = new sst.aws.Nextjs("Site", {
      domain: { name: "example.com", dns: sst.cloudflare.dns() },
      environment: { NEXT_PUBLIC_SITE_URL: "https://example.com" },
    });
    return { site: site.url };
  },
});
