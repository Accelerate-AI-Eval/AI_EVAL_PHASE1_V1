import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
const PROMPT = `You are an enterprise implementation and program risk analyst. The user has a COMPLETE buyer vendor risk assessment report (JSON), optional database-matched catalog risks with mitigations, and optional buyer validation notes.

Output ONLY valid JSON (no markdown, no code fences) with exactly these keys:

{
  "scoreAndRecommendation": {
    "overallScore": <integer 0-100, higher = better readiness to proceed>,
    "recommendation": "Proceed" | "Proceed with conditions" | "Defer",
    "rationale": "<2-5 sentences tying score to recommendation>"
  },
  "breakdown": {
    "vendorFit": { "score": <0-100>, "summary": "<vendor/product fit vs buyer need>" },
    "orgReadinessGap": { "score": <0-100 higher=better readiness>, "summary": "<governance, maturity, change>" },
    "integrationRisk": { "score": <0-100 higher=lower integration risk>, "summary": "<systems, APIs, data flows>" }
  },
  "readinessGaps": {
    "technical": ["<gap>", "..."],
    "governance": ["<gap>", "..."],
    "talent": ["<gap>", "..."]
  },
  "timelineImpact": {
    "drivers": ["<driver that lengthens or shortens schedule>", "..."],
    "assumptions": ["<explicit assumption>", "..."],
    "narrative": "<how timeline is affected; 2-5 sentences>"
  },
  "budgetImpactMvp": {
    "roughOrderOfMagnitude": "<e.g. $X–$Y for MVP pilot; use bands if uncertain>",
    "notes": "<what drives cost; what is excluded>"
  }
}

Rules:
- recommendation must align with overallScore (high score + Proceed unless blockers; Defer for severe gaps).
- readinessGaps: 3-6 bullets per category where applicable; use empty arrays only if truly none.
- Use only information supported by inputs; if thin, state limitations in narrative fields.`;
function extractJsonObject(text) {
    const t = text.trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start)
        return null;
    try {
        return JSON.parse(t.slice(start, end + 1));
    }
    catch {
        return null;
    }
}
function clampScore(n, fb) {
    if (!Number.isFinite(n))
        return fb;
    return Math.min(100, Math.max(0, Math.round(n)));
}
function parseRecommendation(v) {
    const s = String(v ?? "").trim();
    if (s === "Proceed" || s === "Proceed with conditions" || s === "Defer")
        return s;
    return "Proceed with conditions";
}
function asStringArray(raw, max = 12) {
    if (!Array.isArray(raw))
        return [];
    return raw.map((x) => String(x).slice(0, 500)).filter(Boolean).slice(0, max);
}
function normalizePayload(raw, fb) {
    const srRaw = raw.scoreAndRecommendation;
    const scoreAndRecommendation = srRaw
        ? {
            overallScore: clampScore(Number(srRaw.overallScore), fb.scoreAndRecommendation.overallScore),
            recommendation: parseRecommendation(srRaw.recommendation),
            rationale: String(srRaw.rationale ?? fb.scoreAndRecommendation.rationale).slice(0, 3000),
        }
        : fb.scoreAndRecommendation;
    const bRaw = raw.breakdown;
    const vf = bRaw?.vendorFit;
    const org = bRaw?.orgReadinessGap;
    const ir = bRaw?.integrationRisk;
    const breakdown = {
        vendorFit: {
            score: clampScore(Number(vf?.score), fb.breakdown.vendorFit.score),
            summary: String(vf?.summary ?? fb.breakdown.vendorFit.summary).slice(0, 2000),
        },
        orgReadinessGap: {
            score: clampScore(Number(org?.score), fb.breakdown.orgReadinessGap.score),
            summary: String(org?.summary ?? fb.breakdown.orgReadinessGap.summary).slice(0, 2000),
        },
        integrationRisk: {
            score: clampScore(Number(ir?.score), fb.breakdown.integrationRisk.score),
            summary: String(ir?.summary ?? fb.breakdown.integrationRisk.summary).slice(0, 2000),
        },
    };
    const rgRaw = raw.readinessGaps;
    const readinessGaps = {
        technical: asStringArray(rgRaw?.technical).length > 0 ? asStringArray(rgRaw?.technical) : fb.readinessGaps.technical,
        governance: asStringArray(rgRaw?.governance).length > 0 ? asStringArray(rgRaw?.governance) : fb.readinessGaps.governance,
        talent: asStringArray(rgRaw?.talent).length > 0 ? asStringArray(rgRaw?.talent) : fb.readinessGaps.talent,
    };
    const tiRaw = raw.timelineImpact;
    const timelineImpact = {
        drivers: asStringArray(tiRaw?.drivers).length > 0 ? asStringArray(tiRaw?.drivers) : fb.timelineImpact.drivers,
        assumptions: asStringArray(tiRaw?.assumptions).length > 0 ? asStringArray(tiRaw?.assumptions) : fb.timelineImpact.assumptions,
        narrative: String(tiRaw?.narrative ?? fb.timelineImpact.narrative).slice(0, 3000),
    };
    const biRaw = raw.budgetImpactMvp;
    const budgetImpactMvp = {
        roughOrderOfMagnitude: String(biRaw?.roughOrderOfMagnitude ?? fb.budgetImpactMvp.roughOrderOfMagnitude).slice(0, 500),
        notes: String(biRaw?.notes ?? fb.budgetImpactMvp.notes).slice(0, 2000),
    };
    return {
        scoreAndRecommendation,
        breakdown,
        readinessGaps,
        timelineImpact,
        budgetImpactMvp,
    };
}
function fallbackPayload(completeReport) {
    const overall = Number(completeReport.overallRiskScore);
    const base = Number.isFinite(overall) ? clampScore(overall, 65) : 65;
    return {
        scoreAndRecommendation: {
            overallScore: base,
            recommendation: base >= 75 ? "Proceed" : base >= 50 ? "Proceed with conditions" : "Defer",
            rationale: String(completeReport.executiveSummary ?? "").slice(0, 1500) || "See complete assessment for context.",
        },
        breakdown: {
            vendorFit: { score: base, summary: "Derived from complete report vendor fit and attestation themes." },
            orgReadinessGap: { score: Math.max(40, base - 10), summary: "Governance and maturity per buyer assessment fields." },
            integrationRisk: { score: Math.max(40, base - 5), summary: "Integration scope from buyer systems and vendor APIs." },
        },
        readinessGaps: {
            technical: ["Confirm API and data contract details with vendor."],
            governance: ["Align AI use with internal policies and oversight."],
            talent: ["Staff training and change management for rollout."],
        },
        timelineImpact: {
            drivers: ["Pilot scope", "Integration complexity", "Procurement"],
            assumptions: ["Vendor delivery as quoted", "Buyer resources available"],
            narrative: "Timeline sensitivity depends on integration breadth and governance gates.",
        },
        budgetImpactMvp: {
            roughOrderOfMagnitude: "Order-of-magnitude not computable from inputs alone — use internal finance bands.",
            notes: "Refine after vendor quote and pilot scope lock.",
        },
    };
}
async function invokeModel(prompt) {
    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 8192,
        temperature: 0.3,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
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
export async function generateImplementationRiskAssessmentReport(completeReport, dbRisksBlock, buyerValidationSnippet) {
    const fb = fallbackPayload(completeReport);
    const userPrompt = [
        PROMPT,
        "",
        dbRisksBlock ? dbRisksBlock : "(No database-matched catalog risks block for this run.)",
        "",
        "--- Buyer validation / testing notes (may be empty) ---",
        buyerValidationSnippet.slice(0, 6000),
        "",
        "--- Complete buyer vendor risk report (JSON) ---",
        JSON.stringify(completeReport, null, 2).slice(0, 24000),
        "",
        "Respond with ONLY the JSON object for the keys above.",
    ].join("\n");
    try {
        const rawText = await invokeModel(userPrompt);
        const parsed = extractJsonObject(rawText);
        if (parsed)
            return normalizePayload(parsed, fb);
    }
    catch (e) {
        console.error("generateImplementationRiskAssessmentReport LLM error:", e);
    }
    return fb;
}
