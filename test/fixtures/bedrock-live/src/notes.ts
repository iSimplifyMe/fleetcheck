import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const client = new BedrockRuntimeClient({ region: "us-east-1" });
const MODEL_ID = "us.anthropic.claude-sonnet-5";
export async function summarize(text: string): Promise<string> {
  const resp = await client.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 500, messages: [{ role: "user", content: text }] }),
  }));
  const result = JSON.parse(new TextDecoder().decode(resp.body));
  return result.content?.[0]?.text || "";
}
