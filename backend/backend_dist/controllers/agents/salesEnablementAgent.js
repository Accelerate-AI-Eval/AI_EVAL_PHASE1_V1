import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
const SALES_ENABLEMENT_PROMPT = `You are a sales enablement analyst. Using ONLY the Assessment Analysis Report (complete report) data provided below, generate two artifacts for sales positioning:

1. **SWOT Analysis** – For sales positioning when engaging prospects, derive from the report:
   - **Strengths:** 3–5 strengths (e.g. security posture, compliance, differentiators).
   - **Weaknesses:** 2–4 weaknesses or gaps (e.g. dependencies, cost, coverage).
   - **Opportunities:** 2–4 opportunities (e.g. market fit, certifications, use cases).
   - **Threats:** 2–4 threats (e.g. regulatory, competitive, operational).

2. **Battle Card** – A one-pager for sales conversations:
   - **title:** A compelling one-line title for this solution (e.g. "Trust and Reliability in AI: [Product] Enterprise-Grade Solution").
   - **keyDifferentiators:** 3–5 bullet points (security, compliance, reliability, governance).
   - **complianceHighlights:** 2–4 bullets on certifications and compliance posture from the report.
   - **objectionHandling:** One common objection with a concise answer: { "question": "...", "answer": "..." }.
   - **qaBlocks:** 1–3 Q&A pairs (question, answer) for common buyer questions.
   - **idealCustomerProfile:** 1–2 sentences describing the ideal customer for this solution.

Output ONLY a single JSON object in a fenced code block starting with \`\`\`json and ending with \`\`\`. The JSON must have exactly two keys: "swot" and "battleCard".

- "swot" must be: { "strengths": string[], "weaknesses": string[], "opportunities": string[], "threats": string[] }
- "battleCard" must be: { "title": string, "keyDifferentiators"?: string[], "complianceHighlights"?: string[], "objectionHandling"?: { "question": string, "answer": string }, "qaBlocks"?: { "question": string, "answer": string }[], "idealCustomerProfile"?: string }

Use only the data provided in the report. Do not invent facts. If the report lacks detail, infer only from context or use brief placeholders. Be concise.`;
const SWOT_ONLY_PROMPT = `You are a sales enablement analyst. Using ONLY the Assessment Analysis Report (complete report) data provided below, generate a SWOT analysis for sales positioning when engaging prospects:

- **Strengths:** 3–5 strengths (e.g. security posture, compliance, differentiators).
- **Weaknesses:** 2–4 weaknesses or gaps (e.g. dependencies, cost, coverage).
- **Opportunities:** 2–4 opportunities (e.g. market fit, certifications, use cases).
- **Threats:** 2–4 threats (e.g. regulatory, competitive, operational).

Output ONLY a single JSON object in a fenced code block starting with \`\`\`json and ending with \`\`\`. The JSON must have exactly one key: "swot".
- "swot" must be: { "strengths": string[], "weaknesses": string[], "opportunities": string[], "threats": string[] }

Use only the data provided in the report. Do not invent facts. Be concise.`;
const BATTLE_CARD_ONLY_PROMPT = `You are a sales enablement analyst. Using ONLY the Assessment Analysis Report (complete report) data provided below, generate a Battle Card (one-pager for sales conversations):

- **title:** A compelling one-line title for this solution (e.g. "Trust and Reliability in AI: [Product] Enterprise-Grade Solution").
- **keyDifferentiators:** 3–5 bullet points (security, compliance, reliability, governance).
- **complianceHighlights:** 2–4 bullets on certifications and compliance posture from the report.
- **objectionHandling:** One common objection with a concise answer: { "question": "...", "answer": "..." }.
- **qaBlocks:** 1–3 Q&A pairs (question, answer) for common buyer questions.
- **idealCustomerProfile:** 1–2 sentences describing the ideal customer for this solution.

Output ONLY a single JSON object in a fenced code block starting with \`\`\`json and ending with \`\`\`. The JSON must have exactly one key: "battleCard".
- "battleCard" must be: { "title": string, "keyDifferentiators"?: string[], "complianceHighlights"?: string[], "objectionHandling"?: { "question": string, "answer": string }, "qaBlocks"?: { "question": string, "answer": string }[], "idealCustomerProfile"?: string }

Use only the data provided in the report. Do not invent facts. Be concise.`;
function buildReportContext(reportJson) {
    const reportStr = typeof reportJson === "object" && reportJson !== null
        ? JSON.stringify(reportJson, null, 2)
        : String(reportJson);
    return [
        "--- Complete Assessment Analysis Report ---",
        reportStr.slice(0, 24000),
        "--- End of report ---",
    ].join("\n");
}
async function invokeModel(userInput) {
    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 8192,
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
function parseSwot(v) {
    if (v == null || typeof v !== "object") {
        return { strengths: [], weaknesses: [], opportunities: [], threats: [] };
    }
    const o = v;
    const arr = (x) => Array.isArray(x) ? x.filter((i) => typeof i === "string") : [];
    return {
        strengths: arr(o.strengths),
        weaknesses: arr(o.weaknesses),
        opportunities: arr(o.opportunities),
        threats: arr(o.threats),
    };
}
function parseBattleCard(v) {
    if (v == null || typeof v !== "object") {
        return { title: "Battle Card" };
    }
    const o = v;
    const arr = (x) => Array.isArray(x) ? x.filter((i) => typeof i === "string") : [];
    let objectionHandling;
    if (o.objectionHandling != null && typeof o.objectionHandling === "object") {
        const oh = o.objectionHandling;
        objectionHandling = {
            question: String(oh.question ?? ""),
            answer: String(oh.answer ?? ""),
        };
    }
    let qaBlocks;
    if (Array.isArray(o.qaBlocks)) {
        qaBlocks = o.qaBlocks
            .filter((i) => i != null && typeof i === "object")
            .map((i) => ({ question: String(i.question ?? ""), answer: String(i.answer ?? "") }));
    }
    return {
        title: String(o.title ?? "Battle Card"),
        keyDifferentiators: arr(o.keyDifferentiators),
        complianceHighlights: arr(o.complianceHighlights),
        objectionHandling,
        qaBlocks: qaBlocks && qaBlocks.length > 0 ? qaBlocks : undefined,
        idealCustomerProfile: typeof o.idealCustomerProfile === "string" ? o.idealCustomerProfile : undefined,
        bullets: arr(o.bullets),
    };
}
const DEFAULT_SWOT = {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
};
const DEFAULT_BATTLE_CARD = { title: "Battle Card" };
/**
 * Generate SWOT and/or Battle Card from a complete assessment report (report JSON).
 * When type is "swot" only SWOT is generated; when "battlecard" only Battle Card; when "both" both are generated.
 */
export async function generateSalesEnablement(reportJson, type = "both") {
    try {
        const context = buildReportContext(reportJson);
        let prompt;
        if (type === "swot") {
            prompt = SWOT_ONLY_PROMPT + "\n\n" + context;
        }
        else if (type === "battlecard") {
            prompt = BATTLE_CARD_ONLY_PROMPT + "\n\n" + context;
        }
        else {
            prompt = SALES_ENABLEMENT_PROMPT + "\n\n" + context;
        }
        const rawReply = await invokeModel(prompt);
        if (!rawReply.trim())
            return null;
        const jsonBlock = rawReply.match(/```json\s*([\s\S]*?)```/)?.[1] ??
            rawReply.match(/```\s*([\s\S]*?)```/)?.[1];
        if (!jsonBlock) {
            console.error("salesEnablementAgent: no JSON block in reply");
            return null;
        }
        const parsed = JSON.parse(jsonBlock.trim());
        if (type === "swot") {
            const swot = parseSwot(parsed.swot);
            return { swot, battleCard: DEFAULT_BATTLE_CARD };
        }
        if (type === "battlecard") {
            const battleCard = parseBattleCard(parsed.battleCard);
            return { swot: DEFAULT_SWOT, battleCard };
        }
        const swot = parseSwot(parsed.swot);
        const battleCard = parseBattleCard(parsed.battleCard);
        return { swot, battleCard };
    }
    catch (err) {
        console.error("generateSalesEnablement error:", err);
        return null;
    }
}
const SALES_CHAT_SYSTEM_PROMPT = `You are an AI Sales Enablement Assistant. You help sales teams by answering questions about a specific vendor assessment and its complete analysis report.

Use ONLY the Assessment Analysis Report data provided below to answer the user's question. Be concise and relevant. If the report does not contain enough information to answer, say so and suggest what might be needed. Do not invent data. Focus on compliance, risk, security, deployment, and sales positioning when relevant.`;
/**
 * Answer a user question about the selected assessment using the complete report.
 * Used by the Sales Agent chatbot when the user sends a question (not SWOT/Battle Card).
 */
export async function answerSalesQuestion(reportJson, question) {
    try {
        const context = buildReportContext(reportJson);
        const userInput = SALES_CHAT_SYSTEM_PROMPT +
            "\n\n" +
            context +
            "\n\n--- User question ---\n" +
            (question || "No question provided.").trim();
        const reply = await invokeModel(userInput);
        return reply?.trim() || null;
    }
    catch (err) {
        console.error("answerSalesQuestion error:", err);
        return null;
    }
}
