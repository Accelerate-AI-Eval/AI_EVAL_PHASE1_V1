import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import * as readline from "readline";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
// ✅ USE INFERENCE PROFILE ARN OR ID
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const messages = [];
async function chat(userInput) {
    messages.push({
        role: "user",
        content: [{ type: "text", text: userInput }],
    });
    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 500,
        temperature: 0.7,
        messages,
    });
    const command = new InvokeModelCommand({
        modelId: MODEL_ID, // ← inference profile here
        contentType: "application/json",
        accept: "application/json",
        body,
    });
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    const reply = result.content[0].text;
    messages.push({
        role: "assistant",
        content: [{ type: "text", text: reply }],
    });
    return reply;
}
async function main() {
    console.log("Claude Opus 4.5 chat (Inference Profile)");
    console.log("Type 'exit' to quit\n");
    while (true) {
        const input = await new Promise((res) => rl.question("> ", res));
        if (input.toLowerCase() === "exit")
            break;
        try {
            const reply = await chat(input);
            console.log("\nClaude:", reply, "\n");
        }
        catch (err) {
            console.error("Error invoking Claude:", err instanceof Error ? err.message : err);
        }
    }
    rl.close();
}
main();
