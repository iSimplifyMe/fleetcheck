// Fixture: the April 2026 incident patterns plus every allowlisted shape the
// fleet legitimately uses. Only the three app-secret lines should fire.
// NEVER use `process.env.X || ""` for app secrets. <- comment must not fire
export default {
  app() {
    return {
      name: "fixture-app",
      providers: {
        aws: { profile: process.env.GITHUB_ACTIONS ? undefined : "default" },
        cloudflare: { apiToken: process.env.CLOUDFLARE_API_TOKEN },
      },
    };
  },
  async run() {
    const cfZone = process.env.CF_ZONE_FIXTURE || "";
    return {
      environment: {
        AUTH_SECRET: process.env.AUTH_SECRET || "",
        APEX_LEAD_SECRET: process.env.APEX_LEAD_SECRET ?? '',
        STRIPE_WEBHOOK_SECRET: "whsec_1234567890abcdef",
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
        AUTH_TRUST_URL: process.env.AUTH_TRUST_URL || "http://localhost:3000",
        CONTACT_FORM_TO: process.env.CONTACT_FORM_TO || "contact@example.com",
        PLATFORM_FEE_PERCENT: process.env.PLATFORM_FEE_PERCENT || "0.4",
        CF_ZONE_ID: cfZone,
      },
    };
  },
};
