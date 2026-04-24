import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
const CUSTOMER_RISK_MITIGATION_PROMPT = `You are a risk and compliance analyst. Using ONLY the Assessment Analysis Report and Vendor Attestation data provided below, generate a Customer Risk Mitigation Plan in this exact format. Use clear headings and bullets. Do not invent data not present in the inputs.

## Customer context (sector, use case, data class, requirements)
- **Sector:** [From report or attestation]
- **Use case:** [From report or attestation]
- **Data class:** [Sensitivity/classification if mentioned]
- **Key requirements:** [Bullets from report or attestation]

## Top risks (ranked) with likelihood, impact, severity
- **Risk 1:** [Description] – Likelihood: [Low/Medium/High] – Impact: [Low/Medium/High] – Severity: [level]
- **Risk 2:** [Description] – Likelihood / Impact / Severity
- [Continue for top risks; rank by severity or impact]

## Mitigations per risk (top 2–3) + notes if already covered
- **For Risk 1:** [Mitigation 1]; [Mitigation 2]; [Note if already covered in attestation/report]
- **For Risk 2:** [Mitigation 1]; [Mitigation 2]; [Note if already covered]
- [Top 2–3 mitigations per risk; note where already addressed]

## Ownership matrix (Vendor / Buyer / Shared)
- [Risk or mitigation]: **Vendor** / **Buyer** / **Shared** – [Brief note]
- [Repeat for key items]

## Phasing: pre-deploy / deploy / post-go-live
- **Pre-deploy:** [Actions or checks before deployment]
- **Deploy:** [Deployment-phase actions]
- **Post-go-live:** [Ongoing validation or monitoring]

## Validation criteria per mitigation (how to confirm)
- **Mitigation [X]:** [How to confirm it is in place or effective]
- [Repeat for key mitigations]

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
 * Generate Customer Risk Mitigation Plan (sections 22–27) from assessment report + vendor attestation.
 */
export async function generateCustomerRiskMitigationPlan(reportJson, attestationSummary) {
    const context = buildContext(reportJson, attestationSummary);
    const userInput = CUSTOMER_RISK_MITIGATION_PROMPT + "\n\n" + context;
    return invokeModel(userInput);
}
