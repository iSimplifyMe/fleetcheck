/// <reference path="./.sst/platform/config.d.ts" />
// A static builder stores only the environment it is given, not process.env.
export default $config({
  app(input) {
    return { name: "site", home: "aws" };
  },
  async run() {
    new sst.aws.StaticSite("Site", {
      build: { command: "npm run build", output: "out" },
      environment: { NEXT_PUBLIC_SITE_URL: "https://example.com" },
    });
    new sst.aws.Function("Api", { handler: "src/api.handler", url: true });
  },
});
