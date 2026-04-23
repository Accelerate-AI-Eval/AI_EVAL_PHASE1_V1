import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
const PROMPT = `You are an enterprise GRC program manager. The user has a COMPLETE buyer vendor risk assessment report (JSON), optional database-matched catalog risks with mitigations, and optional buyer validation notes.

Output ONLY valid JSON (no markdown, no code fences) with exactly these keys:

{
  "actions": [
    {
      "rank": 1,
      "title": "<short action title>",
      "score": <integer 0-100 priority, higher = more urgent>,
      "phase": "<e.g. Immediate | Pilot | Scale | Operate>",
      "responsible": "<RACI: who does the work>",
      "accountable": "<RACI: ultimately answerable>",
      "consulted": "<RACI: who to consult>",
      "informed": "<RACI: who to inform>",
      "successCriteria": "<what 'done' looks like>",
      "verification": "<how to verify / evidence>"
    }
  ],
  "reassessmentTriggers": ["<trigger event>", "..."],
  "reassessmentCadence": "<e.g. quarterly review, annual, after major change>",
  "csvExport": {
    "fieldDefinitions": [
      { "fieldName": "rank", "description": "Sort order" },
      { "fieldName": "title", "description": "Action title" }
    ],
    "formatNotes": "<UTF-8, comma delimiter, quote fields with commas; include all action columns plus RACI and verification>"
  }
}

Rules:
- actions: MUST contain between 15 and 30 items, ranked 1..n, sorted by score descending then rank.
- Each action must have all RACI fields (use \"TBD\" or role name if unknown).
- csvExport.fieldDefinitions: include one entry per column you would export for the actions table (rank, title, score, phase, responsible, accountable, consulted, informed, successCriteria, verification) plus any IDs; keep descriptions concise.
- Align actions with catalog risks/mitigations and buyer recommendations when those appear in inputs.
Use only information supported by inputs; if thin, still produce 15 actions with conservative, role-based placeholders.`;
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
function normalizeAction(o, rank) {
    return {
        rank: Number.isFinite(Number(o.rank)) ? Math.max(1, Math.round(Number(o.rank))) : rank,
        title: String(o.title ?? `Action ${rank}`).slice(0, 300),
        score: Math.min(100, Math.max(0, Math.round(Number(o.score) || 50))),
        phase: String(o.phase ?? "TBD").slice(0, 120),
        responsible: String(o.responsible ?? "TBD").slice(0, 300),
        accountable: String(o.accountable ?? "TBD").slice(0, 300),
        consulted: String(o.consulted ?? "TBD").slice(0, 300),
        informed: String(o.informed ?? "TBD").slice(0, 300),
        successCriteria: String(o.successCriteria ?? "").slice(0, 800),
        verification: String(o.verification ?? "").slice(0, 800),
    };
}
function normalizePayload(raw, fb) {
    let actions = [];
    if (Array.isArray(raw.actions)) {
        actions = raw.actions
            .map((row, i) => normalizeAction(row, i + 1))
            .sort((a, b) => b.score - a.score || a.rank - b.rank)
            .map((a, i) => ({ ...a, rank: i + 1 }));
    }
    if (actions.length < 15)
        actions = fb.actions;
    const triggers = Array.isArray(raw.reassessmentTriggers)
        ? raw.reassessmentTriggers.map((s) => String(s).slice(0, 400)).filter(Boolean).slice(0, 20)
        : fb.reassessmentTriggers;
    const cadence = String(raw.reassessmentCadence ?? fb.reassessmentCadence).slice(0, 500);
    const csvRaw = raw.csvExport;
    const fdRaw = csvRaw?.fieldDefinitions;
    const fieldDefinitions = Array.isArray(fdRaw)
        ? fdRaw
            .map((x) => {
            const r = x;
            return {
                fieldName: String(r.fieldName ?? r.field ?? "").slice(0, 80),
                description: String(r.description ?? "").slice(0, 400),
            };
        })
            .filter((x) => x.fieldName)
        : fb.csvExport.fieldDefinitions;
    const formatNotes = String(csvRaw?.formatNotes ?? fb.csvExport.formatNotes).slice(0, 1500);
    return {
        actions: actions.length >= 15 ? actions.slice(0, 30) : fb.actions,
        reassessmentTriggers: triggers.length > 0 ? triggers : fb.reassessmentTriggers,
        reassessmentCadence: cadence || fb.reassessmentCadence,
        csvExport: {
            fieldDefinitions: fieldDefinitions.length > 0 ? fieldDefinitions : fb.csvExport.fieldDefinitions,
            formatNotes: formatNotes || fb.csvExport.formatNotes,
        },
    };
}
function fallbackFromCompleteReport(complete) {
    const recs = Array.isArray(complete.recommendations) ? complete.recommendations : [];
    const baseActions = [];
    let r = 0;
    for (const item of recs) {
        const o = item;
        r += 1;
        baseActions.push({
            rank: r,
            title: String(o.title ?? `Mitigation ${r}`).slice(0, 300),
            score: 80 - r * 2,
            phase: r <= 3 ? "Immediate" : r <= 8 ? "Pilot" : "Scale",
            responsible: "Implementation lead",
            accountable: "Sponsor",
            consulted: "Security / Legal",
            informed: "Business owners",
            successCriteria: String(o.description ?? "Complete per plan").slice(0, 800),
            verification: "Sign-off and evidence attached",
        });
        if (baseActions.length >= 20)
            break;
    }
    while (baseActions.length < 15) {
        const n = baseActions.length + 1;
        baseActions.push({
            rank: n,
            title: `Control strengthening ${n}`,
            score: 55,
            phase: "Operate",
            responsible: "Ops",
            accountable: "Sponsor",
            consulted: "Risk",
            informed: "Stakeholders",
            successCriteria: "Control operating as designed",
            verification: "Sample testing",
        });
    }
    return {
        actions: baseActions.slice(0, 30),
        reassessmentTriggers: [
            "Material change in vendor subprocessors or hosting",
            "Regulatory or policy change affecting AI use",
            "Security incident or audit finding",
        ],
        reassessmentCadence: "Quarterly for high-risk use cases; annual minimum for stable production.",
        csvExport: {
            fieldDefinitions: [
                { fieldName: "rank", description: "Execution order (1 = first)" },
                { fieldName: "title", description: "Mitigation action title" },
                { fieldName: "score", description: "Priority score 0–100" },
                { fieldName: "phase", description: "Program phase" },
                { fieldName: "responsible", description: "RACI: Responsible" },
                { fieldName: "accountable", description: "RACI: Accountable" },
                { fieldName: "consulted", description: "RACI: Consulted" },
                { fieldName: "informed", description: "RACI: Informed" },
                { fieldName: "successCriteria", description: "Definition of done" },
                { fieldName: "verification", description: "How to verify" },
            ],
            formatNotes: "UTF-8, comma-separated; quote fields containing commas; header row recommended.",
        },
    };
}
async function invokeModel(prompt) {
    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 8192,
        temperature: 0.25,
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
export async function generateMitigationActionPlanReport(completeReport, dbRisksBlock, buyerValidationSnippet) {
    const fb = fallbackFromCompleteReport(completeReport);
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
        console.error("generateMitigationActionPlanReport LLM error:", e);
    }
    return fb;
}
