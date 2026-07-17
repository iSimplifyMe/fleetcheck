import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const client = new BedrockRuntimeClient({ region: "us-east-1" });
const MODEL_ID = "us.anthropic.claude-sonnet-5";
function bedrockText(result: any): string {
  const blocks = result?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("");
}
export async function summarize(text: string): Promise<string> {
  const resp = await client.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 500, messages: [{ role: "user", content: text }] }),
  }));
  const result = JSON.parse(new TextDecoder().decode(resp.body));
  return bedrockText(result);
}
