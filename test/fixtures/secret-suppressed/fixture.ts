// Fixture: every line here is a structurally-fake credential or an escaped
// example — secret-scan must stay silent.
process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
const auth = "Bearer xoxb-test-token";
const mockKey = "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----";
// fleetcheck-ignore-next-line: shape-valid docs example, not a real credential
const example = "cfut_Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv";
export { auth, mockKey, example };
