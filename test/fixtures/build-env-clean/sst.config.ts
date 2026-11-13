/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return { name: "site", home: "aws", providers: { aws: { region: "us-east-1" }, cloudflare: "6.15.0" } };
  },
  async run() {
    // Mark the environment of SST's local build command as a Pulumi secret, so it is
    // encrypted at rest in the deploy state. (fleet wave 2026-11-12)
    const command = await import("@pulumi/command");
    $transform(command.local.Command, (args) => {
      if (args.environment) args.environment = $util.secret(args.environment);
    });
    $transform(aws.cloudfront.Distribution, (args) => { args.isIpv6Enabled = true; });
    const site = new sst.aws.Nextjs("Site", { domain: { name: "example.com", dns: sst.cloudflare.dns() } });
    return { site: site.url };
  },
});
