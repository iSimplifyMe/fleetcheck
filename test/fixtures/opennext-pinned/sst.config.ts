export default {
  async run() {
    new sst.aws.Nextjs("Site", {
      openNextVersion: "4.0.2",
      domain: { name: "example.com" },
    });
  },
};
