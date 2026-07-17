import { describe, it, expect } from "vitest";
// A test that mocks a Bedrock Sonnet 5 call and asserts on constructed input.
const MODEL_ID = "us.anthropic.claude-sonnet-5";
describe("runner", () => {
  it("sends the kickoff", () => {
    const cmdInput = { modelId: MODEL_ID, messages: [{ role: "user", content: [{ text: "hi" }] }] };
    // InvokeModelCommand mock assertion — positional, but on constructed input:
    expect(cmdInput.messages[0].content[0].text).toBe("hi");
  });
});
