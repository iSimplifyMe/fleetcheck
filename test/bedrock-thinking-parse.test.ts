import { describe, it, expect } from "vitest";
import { bedrockThinkingParse } from "../src/checks/universal/bedrock-thinking-parse.js";
import { fixtureCtx } from "./helpers.js";

describe("bedrock-thinking-parse", () => {
  it("flags positional content[0].text as ERROR when the file pins a thinking-default model", async () => {
    const findings = await bedrockThinkingParse.run(fixtureCtx("bedrock-live"));
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("bedrock-thinking-parse");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].meta).toMatchObject({ tier: "live" });
    expect(findings[0].file).toContain("notes.ts");
    expect(findings[0].line).toBe(11);
  });

  it("flags positional content[0].text as WARNING on a thinking-off model (latent)", async () => {
    const findings = await bedrockThinkingParse.run(fixtureCtx("bedrock-latent"));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].meta).toMatchObject({ tier: "latent" });
    expect(findings[0].line).toBe(10);
  });

  it("matches the Python bracket form on a boto3 Bedrock caller", async () => {
    const findings = await bedrockThinkingParse.run(fixtureCtx("bedrock-py"));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning"); // opus-4-6 runs thinking off
    expect(findings[0].file).toContain("analyzer.py");
    expect(findings[0].line).toBe(13);
  });

  it("is silent when the file parses block-aware via bedrockText()", async () => {
    const findings = await bedrockThinkingParse.run(fixtureCtx("bedrock-clean"));
    expect(findings).toHaveLength(0);
  });

  it("does not fire on OpenAI choices[0].message.content (no Bedrock/Anthropic signal)", async () => {
    const findings = await bedrockThinkingParse.run(fixtureCtx("bedrock-openai"));
    expect(findings).toHaveLength(0);
  });

  it("does not flag the bad idiom when it appears only inside comments", async () => {
    const findings = await bedrockThinkingParse.run(fixtureCtx("bedrock-comment"));
    expect(findings).toHaveLength(0);
  });

  it("does not flag positional access inside test files (mocks/constructed input)", async () => {
    const findings = await bedrockThinkingParse.run(fixtureCtx("bedrock-testfile"));
    expect(findings).toHaveLength(0);
  });
});
