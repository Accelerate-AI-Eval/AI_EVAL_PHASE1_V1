import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
const EXECUTIVE_BRIEF_PROMPT = `You are an executive briefing analyst. Using ONLY the Assessment Analysis Report and Vendor Attestation data provided below, generate an Executive Stakeholder Brief in this exact format. Use clear headings and bullets. Do not invent data not present in the inputs.

## 3-sentence business case
- **Problem:** [1 sentence – the business problem or pain point]
- **Solution:** [1 sentence – the solution/product in scope]
- **Outcome:** [1 sentence – expected business outcome]

## Risk snapshot
- **RAG status:** [Red / Amber / Green – based on overall risk from the report]
- [Bullet 1 – key risk or mitigation]
- [Bullet 2 – key risk or mitigation]
- [Bullet 3 – key risk or mitigation]

## Compliance snapshot
- **Certifications:** [List certs from attestation or report; or "Not specified"]
- **Frameworks:** [Relevant frameworks from report; or "Not specified"]

## Deployment approach
[2–4 sentences: high-level deployment (e.g. cloud/on-prem, timeline, phases). Use report and attestation data only.]

## ROI/value assumptions
- [Key value or ROI point 1]
- [Key value or ROI point 2]
- [Add more if supported by data; otherwise 1–2 is fine]

## Decision request + suggested timeline
- **Decision request:** [What is being asked of the stakeholder (e.g. approve pilot, budget, sign-off).]
- **Suggested timeline:** [Concrete timeline, e.g. "Decision by [date]; pilot start [date]."]

Use only the data provided. If a section has no relevant data, say "Not specified" or "To be confirmed."`;
function buildContext(reportJson, attestationSummary) {
    const reportStr = typeof reportJson === "object" && reportJson !== null
        ? JSON.stringify(reportJson, null, 2)
        : String(reportJson);
    return [
        "--- Assessment Analysis Report (for this assessment) ---",
        reportStr.slice(0, 12000),
        "--- End of report ---",
        "",
        "--- Vendor Attestation (product selected) ---",
        attestationSummary.slice(0, 8000),
        "--- End of attestation ---",
    ].join("\n");
}
async function invokeModel(userInput) {
    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 4096,
        temperature: 0.3,
        messages: [{ role: "user", content: [{ type: "text", text: userInput }] }],
    });
    const command = new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body,
    });
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    console.log(result);
    return result.content?.[0]?.text ?? "";
}
/**
 * Generate Executive Stakeholder Brief (sections 16–21) from assessment report + vendor attestation.
 */
export async function generateExecutiveStakeholderBrief(reportJson, attestationSummary) {
    const context = buildContext(reportJson, attestationSummary);
    const userInput = EXECUTIVE_BRIEF_PROMPT + "\n\n" + context;
    return invokeModel(userInput);
}
