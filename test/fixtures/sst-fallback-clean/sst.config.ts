// Fixture: the sanctioned pattern — app secrets through sst.Secret, infra
// vars from the shell env. Nothing here should fire.
export default {
  app() {
    return {
      name: "fixture-clean",
      providers: {
        aws: { profile: process.env.GITHUB_ACTIONS ? undefined : "default" },
        cloudflare: { apiToken: process.env.CLOUDFLARE_API_TOKEN },
      },
    };
  },
  async run() {
    const authSecret = new sst.Secret("AuthSecret");
    const leadSecret = new sst.Secret("ApexLeadSecret");
    const cfZone = process.env.CF_ZONE_FIXTURE || "";
    return {
      link: [authSecret, leadSecret],
      environment: {
        CONTACT_FORM_TO: process.env.CONTACT_FORM_TO || "contact@example.com",
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "https://example.com",
      },
    };
  },
};
