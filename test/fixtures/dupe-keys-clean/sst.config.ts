/// <reference path="./.sst/platform/config.d.ts" />
const extra = { region: "us-east-1" };
export default $config({
  app(input) {
    return {
      name: "example",
      providers: { aws: "7.1.0", random: "4.16.6", ...extra },
      home: "aws",
    };
  },
  async run() {
    new sst.aws.Nextjs("Site", {
      transform: {
        cdn: { transform: { distribution: (args: any) => { args.comment = "a"; } } },
        server: { timeout: "30 seconds" },
      },
      environment: { NAME: "a", ["COMPUTED_" + "X"]: "b", ["COMPUTED_" + "Y"]: "c" },
      path: ".",
    });
    const accessors = { get name() { return "a"; }, set name(v: string) {} };
    void accessors;
  },
});
