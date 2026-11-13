/// <reference path="./.sst/platform/config.d.ts" />
// The form for a repo whose tsconfig type-checks this file (isimplifyme-site): no import.
export default $config({
  app(input) {
    return { name: "site", home: "aws" };
  },
  async run() {
    $util.runtime.registerStackTransformation((resource: any) => {
      if (resource.type !== "command:local:Command" || !resource.props?.environment) return undefined;
      resource.props.environment = $util.secret(resource.props.environment);
      return { props: resource.props, opts: resource.opts };
    });
    new sst.aws.Nextjs("Site", {});
  },
});
