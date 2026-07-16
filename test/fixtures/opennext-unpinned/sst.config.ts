export default {
  async run() {
    new sst.aws.Nextjs("Site", {
      domain: { name: "example.com" },
    });
  },
};
