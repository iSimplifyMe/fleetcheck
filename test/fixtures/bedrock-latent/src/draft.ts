import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const client = new BedrockRuntimeClient({ region: "us-east-1" });
const MODEL_ID = "us.anthropic.claude-sonnet-4-6";
export async function draft(text: string): Promise<string> {
  const resp = await client.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 900, messages: [{ role: "user", content: text }] }),
  }));
  const raw = JSON.parse(new TextDecoder().decode(resp.body));
  return raw.content[0].text;
}
