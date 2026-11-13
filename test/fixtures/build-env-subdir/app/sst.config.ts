/// <reference path="./.sst/platform/config.d.ts" />
// The app lives one directory down (cook-county-lens).
export default $config({
  app(input) {
    return { name: "lens", home: "aws" };
  },
  async run() {
    new sst.aws.Nextjs("Web", { path: "." });
  },
});
