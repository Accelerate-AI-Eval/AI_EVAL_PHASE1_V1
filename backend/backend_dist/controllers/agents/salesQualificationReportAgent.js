import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
const SALES_REPORT_PROMPT = `You are a sales qualification analyst. Using ONLY the Assessment Analysis Report and Vendor Attestation data provided below, generate a Sales Qualification Report in this exact format. Use clear headings and bullets. Do not invent data not present in the inputs.

## Qualification decision + rationale (3-5 bullets)
- [Bullet 1 – key rationale for qualify/disqualify]
- [Bullet 2]
- [Bullet 3]
- [Bullet 4 – if supported by data]
- [Bullet 5 – if supported by data]

## Score summary: SalesQualificationScore + WinProbability
- **SalesQualificationScore:** [Score or band, e.g. 1-10 or High/Medium/Low – derive from report data]
- **WinProbability:** [Percentage or band – derive from report data]

## Score breakdown: Customer Friction / Implementation / Competitive
- **Customer Friction:** [Summary and score or level from report]
- **Implementation:** [Summary and score or level from report]
- **Competitive:** [Summary and score or level from report]

## Top blockers (max 3) + severity + evidence (which input triggered it)
- **Blocker:** [Description] – Severity: [High/Medium/Low] – Evidence: [which input or finding triggered it]
- **Blocker:** [Description] – Severity: [High/Medium/Low] – Evidence: [which input triggered it]
- **Blocker:** [Description] – Severity: [High/Medium/Low] – Evidence: [which input triggered it]

## Recommended actions (max 5) mapped to blockers
- [Action – mapped to a blocker]
- [Action – mapped to a blocker]
- [Action – mapped to a blocker]
- [Action – if supported]
- [Action – if supported]

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
    return result.content?.[0]?.text ?? "";
}
/**
 * Generate Sales Qualification Report (sections 11–15) from assessment report + vendor attestation.
 */
export async function generateSalesQualificationReport(reportJson, attestationSummary) {
    const context = buildContext(reportJson, attestationSummary);
    const userInput = SALES_REPORT_PROMPT + "\n\n" + context;
    return invokeModel(userInput);
}
