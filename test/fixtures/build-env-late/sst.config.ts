/// <reference path="./.sst/platform/config.d.ts" />
// Looks fixed and is not: the site is registered before the transformation.
export default $config({
  app(input) {
    return { name: "site", home: "aws" };
  },
  async run() {
    const site = new sst.aws.Nextjs("Site", {});
    const command = await import("@pulumi/command");
    $transform(command.local.Command, (args) => {
      if (args.environment) args.environment = $util.secret(args.environment);
    });
    return { site: site.url };
  },
});
