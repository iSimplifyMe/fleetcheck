/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "example",
      providers: { aws: "7.1.0" },
      home: "aws",
      providers: { random: "4.16.6" },
    };
  },
  async run() {
    new sst.aws.Nextjs("Site", {
      transform: { cdn: { transform: { distribution: (args: any) => { args.comment = "a"; } } } },
      path: ".",
      transform: { server: { timeout: "30 seconds" } },
    });
  },
});
