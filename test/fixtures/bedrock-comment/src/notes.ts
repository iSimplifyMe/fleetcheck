import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const client = new BedrockRuntimeClient({ region: "us-east-1" });
const MODEL_ID = "us.anthropic.claude-sonnet-5";
function bedrockText(result: any): string {
  // NOT result.content[0].text — that is the thinking block on Sonnet 5.
  /* Never index result.content[0].text here; concatenate text blocks instead. */
  return (result?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
}
export async function summarize(text: string): Promise<string> {
  const resp = await client.send(new InvokeModelCommand({
    modelId: MODEL_ID,
    body: JSON.stringify({ anthropic_version: "bedrock-2023-05-31", max_tokens: 500, messages: [{ role: "user", content: text }] }),
  }));
  return bedrockText(JSON.parse(new TextDecoder().decode(resp.body)));
}
