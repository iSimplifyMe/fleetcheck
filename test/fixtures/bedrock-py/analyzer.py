import json
import boto3

client = boto3.client("bedrock-runtime", region_name="us-east-1")
MODEL_ID = "us.anthropic.claude-opus-4-6-v1"

def analyze(text):
    resp = client.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": 600, "messages": [{"role": "user", "content": text}]}),
    )
    result = json.loads(resp["body"].read())
    return result["content"][0]["text"]
