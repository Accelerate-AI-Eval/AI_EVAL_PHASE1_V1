import "dotenv/config";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  CERTIFICATIONS_SCORE_CAP,
  normalizeCertIndustrySegmentInput,
  getRelevantCertificationFrameworkSet,
} from "../../services/certIndustrySegmentRelevance.js";
import {
  collectComplianceUploadFileNames,
  certificationFormTextFromGetter,
} from "../../services/complianceCertBlobs.js";

const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
// const MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

const client = new BedrockRuntimeClient({ region: REGION });

export interface TrustScoreBlock {
  overallScore: number;
  label: string;
  summary: string;
  /** Letter grade from trust formula when computed from formula path (A–E). */
  grade?: string;
  scoreByCategory?: Record<string, string | number>;
}

export interface ReportSection {
  id: number;
  title: string;
  subtitle?: string;
  items: Record<string, string>;
}

export interface VendorAttestationReport {
  trustScore: TrustScoreBlock;
  sections: ReportSection[];
  raw?: string;
}

const SECTION_TITLES: Record<number, string> = {
  0: "Trust Score",
  1: "Product Information",
  2: "Company Overview",
  3: "AI Models & Technology",
  4: "AI Governance",
  5: "Security Posture",
  6: "Data Practices",
  7: "Compliance & Certifications",
  8: "Operations & Support",
  9: "Vendor Management",
};

const VENDOR_ATTESTATION_PROMPT = `You are a vendor attestation analyst. Using ONLY the vendor data provided below, generate a structured vendor attestation report. For any detail not explicitly stated in the data, infer a reasonable value consistent with the vendor type and product, or write "Not specified" where nothing can be inferred.

Output the report in the following sections with clear headings and bullet points. Use the exact section titles and item labels below. Write concise, professional descriptions (1–2 sentences per item where appropriate).

## 0. Trust Score
First, compute an overall **Trust Score** (0–100) for this vendor based on the provided data. Consider: security posture, compliance and certifications, data practices and privacy, AI governance and safety, operations and reliability, and company maturity. Output:
- **Overall Trust Score:** [0-100] ([label: e.g. High / Moderate / Low])
- **Score by category:** Security, Compliance, Data Practices, AI Governance, Operations, Company Maturity — output each as "CategoryName: score" where score is 0–100 or "Not enough data" (e.g. Security: 85, Compliance: 90, Data Practices: 78, AI Governance: 82, Operations: 88, Company Maturity: 75)
- **Summary:** 2–3 sentences justifying the overall score and noting main strengths and any gaps or risks.

Then continue with the detailed sections below.

## 1. Product Information
- **Product Name:** [name and variant if any]
- **Version:** [model/version if stated]
- **Primary Use Case:** [enterprise use cases]
- **Target Industry:** [industries]
- **Deployment Model:** [e.g. Cloud-hosted (AWS/Azure/GCP), SaaS]
- **Pricing:** [if stated; otherwise "Contact vendor"]
- **Customer Base:** [metrics if stated]
- **Product Description:** [2–3 sentence summary covering security, compliance, and key differentiators]

## 2. Company Overview
- **Legal Name:** [company legal name]
- **Year Founded:** [year]
- **Employees:** [range or count]
- **Annual Revenue / Funding Stage:** [if stated]
- **Key Investors / Headquarters:** [if stated]
- **Operating Regions:** [regions]

## 3. AI Models & Technology
- **Model Types:** [e.g. LLM, custom-trained, NLP]
- **Model Purpose:** [capabilities: understanding, generation, analysis, coding, etc.]
- **Training Data / Transparency:** [explainability level, documentation]
- **Human Oversight:** [advisory vs autonomous, monitoring, alerts, audit logs]
- **Explainability:** [prompt-level control, citations, custom instructions if any]
- **Update Frequency:** [if stated; otherwise "Not specified"]

## 4. AI Governance (Ethics, oversight, and governance)
- **AI Ethics Policy:** [usage policies, safety guidelines]
- **Bias Detection:** [red team, third-party audits, monitoring, statistical tools]
- **Bias Audits:** [frequency, external evaluations]
- **Model Governance:** [safety framework, staged deployment if any]
- **Human-in-the-Loop:** [admin controls, content filtering, intervention]
- **Impact Assessment:** [system cards, documentation for releases]

## 5. Security Posture
- **Encryption at Rest:** [algorithm and infrastructure]
- **Encryption in Transit:** [e.g. TLS 1.2+]
- **Access Control:** [SSO, SAML, OIDC, SCIM, domain verification, roles]
- **MFA Required:** [Yes/No and scope]
- **Penetration Testing:** [frequency and type]
- **Bug Bounty:** [Yes/No; program name if any]
- **Incident Response:** [plan, testing, 24/7 if any]
- **Disaster Recovery:** [multi-region, failover]
- **Uptime SLA:** [percentage and service credits if any]

## 6. Data Practices
- **Data Types Processed:** [documents, code, communications, etc.]
- **PII Handling:** [extent and whether customer data is used for training]
- **Data Collection:** [API, chat interface, retention options]
- **Data Storage:** [infrastructure and encryption]
- **Data Retention:** [default and optional zero retention]
- **Data Location / Residency:** [US, EU, customer choice, etc.]
- **Data Deletion:** [on request, automated]
- **Sub-processors:** [infrastructure, payments, auth if known]

## 7. Compliance & Certifications
- **Certifications:** [SOC 2, ISO, FedRAMP, HIPAA, GDPR, etc.]
- **Regulatory Frameworks:** [NIST, GDPR, CCPA, EU AI Act readiness]
- **HIPAA Compliance:** [BAA eligibility]
- **GDPR Compliance:** [DPA availability]
- **EU AI Act Readiness:** [engagement, preparation]
- **Audit Frequency / Last Audit Date / Audit Findings:** [if stated]

## 8. Operations & Support
- **Support Hours:** [e.g. 24/7 for enterprise]
- **Support SLAs:** [response times by severity]
- **Uptime SLA:** [repeat if not above]
- **Change Management:** [rollouts, version pinning, release notes]

## 9. Vendor Management
- **Critical Vendors:** [infrastructure, payments]
- **Vendor Assessment:** [frequency of risk assessments]
- **Vendor SLAs:** [key SLAs from critical vendors]

---
Vendor data to use (use only this information; infer only when reasonable):

`;

function parseBulletItems(text: string): Record<string, string> {
  const items: Record<string, string> = {};
  // Value stops at next bullet line (- **Label:**) or section (## 1), not at lone "**" so Summary paragraph is captured fully
  const bulletRegex = /^[-*]\s*\*\*(.+?):\*\*\s*([\s\S]*?)(?=\n\s*[-*]\s*\*\*[A-Za-z][^\n]*:|\n\s*##\s*\d|$)/gm;
  let m;
  while ((m = bulletRegex.exec(text)) !== null) {
    const label = m[1].trim();
    const value = m[2].replace(/\n/g, " ").trim();
    if (label && value) items[label] = value;
  }
  return items;
}

const TRUST_SCORE_KNOWN_CATEGORIES = [
  "Security",
  "Compliance",
  "Data Practices",
  "AI Governance",
  "Operations",
  "Company Maturity",
];

function parseTrustScoreBlock(sectionText: string): TrustScoreBlock {
  const items = parseBulletItems(sectionText);
  let overall = items["Overall Trust Score"] || "";

  // First: try exact pattern "**Overall Trust Score:** 72 (Moderate-to-High)" with or without leading bullet
  const overallWithParen = sectionText.match(/\*\*Overall Trust Score\*\*:\s*(\d+)\s*\(([^)]+)\)/i);
  if (overallWithParen) {
    overall = `${overallWithParen[1]} (${overallWithParen[2].trim()})`;
  } else if (!overall && /Overall Trust Score/i.test(sectionText)) {
    const directMatch = sectionText.match(/\*\*Overall Trust Score\*\*:\s*(\d+)\s*[(\[]?\s*([^)\]]*)/i);
    if (directMatch) {
      overall = `${directMatch[1]} (${(directMatch[2] || "").trim()})`.trim();
    }
  }

  const match = overall.match(/(\d+)\s*[(\[]?\s*([^)\]]*)/);
  let overallScore = match
    ? Math.min(100, Math.max(0, parseInt(match[1], 10) || 0))
    : 0;
  let label = (match && match[2] ? match[2].trim() : "") || "Not specified";
  if (overallScore > 0 && (!label || label === "Not specified") && /\([^)]+\)/.test(sectionText)) {
    const parenMatch = sectionText.match(/\*\*Overall Trust Score\*\*:\s*\d+\s*\(([^)]+)\)/i) ?? sectionText.match(/\d+\s*\(([^)]+)\)/);
    if (parenMatch) label = parenMatch[1].trim();
  }

  let summary = items["Summary"] || "";
  if (!summary && /Summary/i.test(sectionText)) {
    const summaryMatch =
      sectionText.match(/\*\*Summary\*\*:\s*([\s\S]*?)(?=\n\s*##|\n\s*[-*]\s*\*\*|$)/im) ??
      sectionText.match(/[-*]\s*\*\*Summary\*\*:\s*([\s\S]*?)(?=\n\s*##|\n\s*[-*]\s*\*\*|$)/im) ??
      sectionText.match(/Summary:\s*([\s\S]*?)(?=\n\s*##|\n\s*[-*]\s*\*\*|$)/im);
    if (summaryMatch) summary = summaryMatch[1].replace(/\n+/g, " ").trim();
  }
  if (!summary.trim() && /Summary/i.test(sectionText)) {
    const afterSummary = sectionText.split(/\*\*Summary\*\*:\s*/i)[1];
    if (afterSummary) {
      // Stop at next bullet line (- **Label:**) or section (##), not at lone "**"
      summary = afterSummary
        .replace(/\n+/g, " ")
        .trim()
        .split(/\n\s*[-*]\s*\*\*[A-Za-z][^\n]*:|\n\s*##/)[0]
        .trim();
    }
  }
  // Format: **Summary** on its own line, content on next line(s)
  if (!summary.trim() && /\*\*Summary\*\*/i.test(sectionText)) {
    const afterLabel = sectionText.match(/(?:^|\n)\s*\*\*Summary\*\*\s*\n\s*([\s\S]*?)(?=\n\s*[-*]\s*\*\*[A-Za-z][^\n]*:|\n\s*##\s*\d|$)/im);
    if (afterLabel && afterLabel[1]) {
      summary = afterLabel[1].replace(/\n+/g, " ").trim();
    }
  }
  const scoreByCategory: Record<string, string | number> = {};

  // Parse "Score by category" single line (e.g. "Security: 85, Compliance: 90")
  const catLine =
    items["Score by category (optional)"] ||
    items["Score by category"] ||
    items["Score by Category"] ||
    "";
  if (catLine) {
    const parts = catLine.split(/[,;]/).map((p) => p.trim());
    for (const p of parts) {
      const kv = p.split(/[:\-]/).map((s) => s.trim());
      if (kv.length >= 2) {
        const k = kv[0];
        const v = kv[1];
        if (k) scoreByCategory[k] = /^\d+$/.test(v) ? parseInt(v, 10) : v;
      }
    }
  }

  // Bullet format: "- Security: 75" etc. – items will have Security: "75"
  for (const cat of TRUST_SCORE_KNOWN_CATEGORIES) {
    if (items[cat] !== undefined && scoreByCategory[cat] === undefined) {
      const v = items[cat].trim();
      if (v) scoreByCategory[cat] = /^\d+$/.test(v) ? parseInt(v, 10) : v;
    }
  }

  // Fallback: if overallScore still 0, try to extract from section text
  if (overallScore === 0 && /Overall Trust Score/i.test(sectionText)) {
    const directNum = sectionText.match(/\*\*Overall Trust Score\*\*:\s*(\d+)/i);
    const numStr = directNum?.[1] ?? sectionText.match(/Overall Trust Score[^*]*?\*\*:\s*(\d+)/i)?.[1];
    const num = numStr != null ? parseInt(numStr, 10) : NaN;
    if (!Number.isNaN(num)) overallScore = Math.min(100, Math.max(0, num));
  }

  // Last resort: first number 1–100 in the block (e.g. "72" in "72 (Moderate)" or nearby)
  if (overallScore === 0) {
    const allNums = sectionText.match(/\b(\d{1,3})\b/g);
    if (allNums) {
      for (const s of allNums) {
        const n = parseInt(s, 10);
        if (n >= 1 && n <= 100) {
          overallScore = n;
          break;
        }
      }
    }
  }

  const filteredScoreByCategory =
    Object.keys(scoreByCategory).length > 0
      ? Object.fromEntries(
          Object.entries(scoreByCategory).filter(([k]) => k != null && String(k).trim() !== ""),
        )
      : undefined;
  return {
    overallScore: Number.isNaN(overallScore) ? 0 : overallScore,
    label,
    summary,
    scoreByCategory:
      filteredScoreByCategory && Object.keys(filteredScoreByCategory).length > 0
        ? filteredScoreByCategory
        : undefined,
  };
}

/** Parse 0–100 score from trust block text (summary/label) for storage fallback when overallScore is 0. */
export function parseScoreFromTrustText(text: string): number | null {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/(\d{1,3})\s*[(\[]/) ?? text.match(/\b(\d{1,3})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : Math.min(100, Math.max(0, n));
}

function parseReportSections(rawReply: string): {
  trustScore: TrustScoreBlock;
  sections: ReportSection[];
} {
  const sections: ReportSection[] = [];
  const sectionRegex = /##\s*(\d+)\.?\s*([^\n]*)\n([\s\S]*?)(?=##\s*\d|$)/g;
  let trustScore: TrustScoreBlock = {
    overallScore: 0,
    label: "Not specified",
    summary: "",
  };

  let m;
  while ((m = sectionRegex.exec(rawReply)) !== null) {
    const id = parseInt(m[1], 10);
    const titleLine = m[2].trim();
    const body = m[3].trim();
    const title = SECTION_TITLES[id] ?? (titleLine || `Section ${id}`);
    const subtitle = titleLine && titleLine !== title ? titleLine : undefined;

    if (id === 0) {
      trustScore = parseTrustScoreBlock(body);
      continue;
    }

    const items = parseBulletItems(body);
    sections.push({
      id,
      title,
      subtitle,
      items,
    });
  }

  // Fallback: if Trust Score block was not found or parsing returned defaults, find block by content
  const needFallback =
    trustScore.overallScore === 0 ||
    trustScore.summary === "" ||
    trustScore.label === "Not specified";
  if (needFallback && /Overall Trust Score|Trust Score|Summary/i.test(rawReply)) {
    let block = "";
    const overallIdx = rawReply.search(/\*\*Overall Trust Score\*\*|Overall Trust Score\s*:/i);
    const sectionZeroIdx = rawReply.search(/##\s*0\.?\s*Trust Score|##\s*Trust Score\b/i);
    const startIdx = overallIdx >= 0 ? overallIdx : sectionZeroIdx >= 0 ? sectionZeroIdx : rawReply.search(/\bTrust Score\b/i);
    if (startIdx >= 0) {
      const rest = rawReply.slice(startIdx);
      const endMatch = rest.match(/\n\s*##\s*[1-9][.\s]/);
      block = endMatch ? rest.slice(0, endMatch.index).trim() : rest.trim();
    }
    if (!block && /Overall Trust Score/i.test(rawReply)) {
      const beforeSection1 = rawReply.split(/\n\s*##\s*1[.\s]/)[0];
      if (beforeSection1 && beforeSection1.length < rawReply.length) block = beforeSection1.trim();
    }
    if (block) {
      const parsed = parseTrustScoreBlock(block);
      if (parsed.overallScore > 0 || parsed.summary || (parsed.label && parsed.label !== "Not specified")) {
        trustScore = {
          overallScore: parsed.overallScore || trustScore.overallScore,
          label: parsed.label && parsed.label !== "Not specified" ? parsed.label : trustScore.label,
          summary: parsed.summary || trustScore.summary,
          scoreByCategory: parsed.scoreByCategory ?? trustScore.scoreByCategory,
        };
      }
    }
  }

  // Last resort: "**Overall Trust Score:** 72 (Moderate-to-High)" anywhere in reply
  if (/Overall Trust Score/i.test(rawReply)) {
    const withLabel = rawReply.match(/\*\*Overall Trust Score\*\*:\s*(\d{1,3})\s*\(([^)]+)\)/i);
    const numOnly = rawReply.match(/\*\*Overall Trust Score\*\*:\s*(\d{1,3})\b/i) ?? rawReply.match(/Overall Trust Score\s*:\s*(\d{1,3})\b/i);
    if (withLabel) {
      const n = parseInt(withLabel[1], 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
        trustScore = {
          ...trustScore,
          overallScore: n,
          label: (trustScore.label === "Not specified" ? withLabel[2].trim() : trustScore.label) || "Not specified",
        };
      }
    } else if (trustScore.overallScore === 0 && numOnly) {
      const n = parseInt(numOnly[1], 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
        trustScore = { ...trustScore, overallScore: n };
      }
    }
  }

  // Last resort: extract Summary from raw reply using same pattern as parseBulletItems / extractSummaryFromRawReply
  if (!trustScore.summary.trim() && (/\*\*Summary\*\*:/i.test(rawReply) || /\*\*Summary\*\*\s*\n/i.test(rawReply))) {
    const fromRaw = extractSummaryFromRawReply(rawReply);
    if (fromRaw) trustScore = { ...trustScore, summary: fromRaw };
  }

  return { trustScore, sections };
}

export function extractSummaryFromRawReply(rawReply: string): string {
  if (!rawReply || typeof rawReply !== "string") return "";

  function clean(s: string): string {
    const t = s.replace(/\s*\n\s*/g, " ").trim();
    const noAsterisks = t.replace(/^\*+|\*+$/g, "").trim();
    return noAsterisks.length > 0 && !/^\*+$/.test(noAsterisks) ? noAsterisks : t.length > 0 && !/^\*+$/.test(t) ? t : "";
  }

  // 1) **Summary:** or **Summary** (optional - or * prefix), content until next bullet/section
  const primaryRegex =
    /(?:^|\n)(?:[-*]\s*)?\*\*Summary\*\*:?\s*\n?\s*([\s\S]*?)(?=\n\s*[-*]\s*\*\*[A-Za-z][^\n]*:|\n\s*##\s*\d|$)/im;
  const primaryMatch = rawReply.match(primaryRegex);
  if (primaryMatch?.[1]) {
    const value = clean(primaryMatch[1]);
    if (value.length > 0) {
      // console.log("[Summary] extractSummaryFromRawReply — primary regex, length:", value.length, "| content:", value);
      return value;
    }
  }

  // 2) Split on **Summary** or **Summary:** and take first block until ## or next ** bullet
  const splitPattern = /\*\*Summary\*\*:?\s*/i;
  if (splitPattern.test(rawReply)) {
    const parts = rawReply.split(splitPattern);
    if (parts.length >= 2) {
      const after = parts[1];
      const untilSection = after.split(/\n\s*##\s*\d/)[0];
      const untilBullet = untilSection.split(/\n\s*[-*]\s*\*\*[A-Za-z]/)[0];
      const value = clean(untilBullet);
      if (value.length > 0) {
        // console.log("[Summary] extractSummaryFromRawReply — fallback split, length:", value.length, "| content:", value);
        return value;
      }
    }
  }

  // 3) Any "Summary" line (with or without **): content after colon or on next lines until ## or next bullet
  const summaryLineMatch = rawReply.match(/\n\s*(?:\*\*)?Summary(?:\*\*)?:?\s*\n?\s*([\s\S]*?)(?=\n\s*##\s*\d|\n\s*[-*]\s*\*\*[A-Za-z]|$)/im);
  if (summaryLineMatch?.[1]) {
    const value = clean(summaryLineMatch[1]);
    if (value.length > 0) {
      // console.log("[Summary] extractSummaryFromRawReply — Summary line match, length:", value.length, "| content:", value);
      return value;
    }
  }

  // 4) Last resort: after first occurrence of "Summary" (case insensitive), take rest until ## 1
  const idx = rawReply.search(/\bSummary\s*:?\s*/i);
  if (idx >= 0) {
    const after = rawReply.slice(idx).replace(/^\s*Summary\s*:?\s*/i, "");
    const block = after.split(/\n\s*##\s*1\b/)[0].split(/\n\s*[-*]\s*\*\*[A-Za-z]/)[0];
    const value = clean(block);
    if (value.length > 0) {
      // console.log("[Summary] extractSummaryFromRawReply — last resort after 'Summary', length:", value.length, "| content:", value);
      return value;
    }
  }

  // console.log("[Summary] extractSummaryFromRawReply — no summary found in raw (length " + rawReply.length + ")");
  return "";
}

export type ReportPayloadAndSummary = {
  reportPayload: { trustScore: unknown; sections: ReportSection[] };
  trustScoreNum: number;
  summaryToStore: string | undefined;
};

/**
 * Build report payload (trust score + sections) and derive summary for DB storage.
 * Use after generateVendorAttestationReport to normalize score and summary consistently.
 */
export function buildReportPayloadAndSummary(report: VendorAttestationReport): ReportPayloadAndSummary {
  let trustScoreNum = typeof report.trustScore?.overallScore === "number" ? report.trustScore.overallScore : 0;
  if (trustScoreNum === 0 && report.trustScore) {
    const fromSummary = parseScoreFromTrustText(String(report.trustScore.summary ?? ""));
    const fromLabel = parseScoreFromTrustText(String(report.trustScore.label ?? ""));
    const fallback = fromSummary ?? fromLabel ?? null;
    if (fallback != null) trustScoreNum = fallback;
  }
  const trustScoreForPayload =
    trustScoreNum !== 0 && report.trustScore
      ? { ...report.trustScore, overallScore: trustScoreNum }
      : report.trustScore;
  const reportPayload = { trustScore: trustScoreForPayload, sections: report.sections };

  const summaryFromReport =
    report.trustScore && typeof report.trustScore === "object" && "summary" in report.trustScore
      ? String((report.trustScore as { summary?: string }).summary ?? "").trim()
      : "";
  const fromRaw = report.raw ? extractSummaryFromRawReply(report.raw).trim() : "";
  const validParsed = summaryFromReport.length > 0 && !/^\*+$/.test(summaryFromReport);
  const summaryToStore = validParsed ? summaryFromReport : (fromRaw.length > 0 ? fromRaw : undefined);

  // console.log("[Summary] Step: buildReportPayloadAndSummary — summaryFromReport (parsed trustScore.summary) length:", summaryFromReport.length, "| complete content:", summaryFromReport);
  // console.log("[Summary] Step: buildReportPayloadAndSummary — fromRaw (extractSummaryFromRawReply) length:", fromRaw.length, "| complete content:", fromRaw);
  // console.log("[Summary] Step: buildReportPayloadAndSummary — summaryToStore:", summaryToStore == null ? "undefined" : "length " + summaryToStore.length, summaryToStore != null ? "| complete content: " + summaryToStore : "");

  if (summaryToStore && reportPayload.trustScore) {
  reportPayload.trustScore = {
    ...reportPayload.trustScore,
    summary: summaryToStore,
  };
}

  return { reportPayload, trustScoreNum, summaryToStore };
}

async function chat(
  messages: { role: string; content: { type: string; text: string }[] }[],
  userInput: string,
) {
  const nextMessages = [
    ...messages,
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: userInput }],
    },
  ];

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 4096,
    temperature: 0.3,
    messages: nextMessages,
  });

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  const reply = result.content?.[0]?.text ?? "";
  return reply;
}

/**
 * Generate a structured vendor attestation report from vendor data.
 * No file I/O; returns the parsed report for API/UI consumption.
 */
export async function generateVendorAttestationReport(
  vendorData: string,
  formulaPayload?: Record<string, unknown>,
): Promise<VendorAttestationReport> {
  if (formulaPayload && typeof formulaPayload === "object") {
    const formulaInput = buildFormulaInputFromPayload(formulaPayload);
    const formula = calculateVendorTrustScore(formulaInput);
    const productScore = Math.max(0, Math.min(100, 100 - Number(formula.product_risk || 0)));
    const governanceScore = Math.max(0, Math.min(100, 100 - Number(formula.governance_risk || 0)));
    const operationalScore = Math.max(0, Math.min(100, 100 - Number(formula.operational_risk || 0)));
    const companyProfile =
      formulaPayload.companyProfile && typeof formulaPayload.companyProfile === "object"
        ? (formulaPayload.companyProfile as Record<string, unknown>)
        : {};
    const summary = buildSummaryFromAssessmentData(formulaPayload);
    const overallRounded = Math.round(Number(formula.vendor_trust_score ?? 0));
    return {
      trustScore: {
        overallScore: overallRounded,
        grade: String(formula.grade ?? "").trim() || undefined,
        label: String(formula.classification ?? "Not specified"),
        summary,
        scoreByCategory: {
          Product: Number(productScore.toFixed(2)),
          Governance: Number(governanceScore.toFixed(2)),
          Operational: Number(operationalScore.toFixed(2)),
        },
      },
      sections: buildSectionsFromPayload(formulaPayload),
      raw: vendorData || "",
    };
  }

  const userInput = VENDOR_ATTESTATION_PROMPT + (vendorData || "");
  const messages: {
    role: string;
    content: { type: string; text: string }[];
  }[] = [];
  const reply = await chat(messages, userInput);
  // console.log("[Summary] Step: generateVendorAttestationReport — raw reply length:", reply.length, "| complete content:", reply);
  const { trustScore, sections } = parseReportSections(reply);
  const parsedSummary = (trustScore.summary || "").trim();
  const summaryFromRaw = extractSummaryFromRawReply(reply);
  if ((parsedSummary.length === 0 || /^\*+$/.test(parsedSummary)) && summaryFromRaw.length > 0) {
    trustScore.summary = summaryFromRaw;
  }
  const contentToLog = (trustScore.summary || "").trim();
  // console.log("[Summary] Step: generateVendorAttestationReport — parsed trustScore.summary length:", contentToLog.length, "| complete content:", contentToLog || "(no summary extracted)");
  return {
    trustScore,
    sections,
    raw: reply,
  };
}

type LooseInput = Record<string, any>;

function buildSummaryFromAssessmentData(payload: Record<string, unknown>): string {
  const cp =
    payload.companyProfile && typeof payload.companyProfile === "object"
      ? (payload.companyProfile as Record<string, unknown>)
      : {};
  const pick = (...vals: unknown[]) => vals.map((v) => String(v ?? "").trim()).find((v) => v.length > 0) ?? "";
  const has = (v: unknown) => String(v ?? "").trim().length > 0;
  const yes = (v: unknown) => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "yes" || s === "true" || s === "available";
  };
  const vendorName = pick(cp.vendorName, payload.vendor_name) || "This vendor";
  const maturity = pick(cp.vendorMaturity, payload.company_stage).toLowerCase();
  const posture =
    maturity.includes("mature") || maturity.includes("growth")
      ? "moderate-to-strong"
      : maturity.includes("early") || maturity.includes("startup")
        ? "moderate"
        : "moderate";

  const strengths: string[] = [];
  if (has(payload.uptime_sla) || has(payload.sla_guarantee)) strengths.push("operations reliability");
  if (has(payload.human_oversight)) strengths.push("human oversight");
  if (has(payload.adversarial_security_testing) || has(payload.security_testing)) strengths.push("adversarial testing");
  if (has(payload.security_certifications) || has(payload.security_compliance_certificates)) strengths.push("core security controls");
  if (yes(payload.incident_response_plan)) strengths.push("incident response preparedness");

  const improvements: string[] = [];
  if (!has(payload.security_certifications) && !has(payload.security_compliance_certificates)) {
    improvements.push("deeper compliance certifications");
  }
  if (!has(payload.model_transparency) && !has(payload.ai_model_transparency)) {
    improvements.push("more comprehensive model transparency");
  }
  if (!has(cp.vendorMaturity) && !has(payload.company_stage)) {
    improvements.push("a more mature company profile");
  }
  if (!has(payload.data_retention_policy)) {
    improvements.push("clearer data retention commitments");
  }

  const strengthsText = strengths.length > 0 ? strengths.slice(0, 3).join(", ") : "baseline operational controls";
  const improvementsText = improvements.length > 0 ? improvements.slice(0, 3).join(", ") : "continued enhancement of governance documentation";

  return `${vendorName} demonstrates a ${posture} overall trust posture as an AI vendor with reasonable security controls, data practices, and AI governance frameworks in place. Key strengths include ${strengthsText}. Areas for improvement include ${improvementsText}.`;
}

function buildFormulaInputFromPayload(payload: Record<string, unknown>): LooseInput {
  const cp =
    payload.companyProfile && typeof payload.companyProfile === "object"
      ? (payload.companyProfile as Record<string, unknown>)
      : {};
  const get = (k: string) => payload[k] ?? cp[k];
  const asStr = (v: unknown) => String(v ?? "").trim();
  const lower = (v: unknown) => asStr(v).toLowerCase();
  const inSet = (v: string, allowed: string[], fallback: string) =>
    allowed.includes(v) ? v : fallback;
  const toNum = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const text = [
    lower(get("decision_autonomy")),
    lower(get("ai_autonomy_level")),
    lower(get("assessment_completion_level")),
    lower(get("pii_handling")),
    lower(get("incident_response_plan")),
  ].join(" ");
  const employeeRaw = lower(get("employeeCount") ?? get("no_of_employees"));
  const yearFounded = Math.max(1990, Math.min(new Date().getFullYear(), toNum(get("yearFounded") ?? get("year_founded"), 2020)));
  const regionCount = Array.isArray(get("operatingRegions")) ? (get("operatingRegions") as unknown[]).length : 1;
  const decisionAutonomyLevel =
    text.includes("fully") && text.includes("autonom") ? "fully_autonomous" :
    text.includes("autonom") ? "autonomous" :
    text.includes("assist") ? "assisted" :
    text.includes("advis") ? "advisory" : "supervised";
  const decisionStakeLevel =
    text.includes("life") ? "Life-Critical" :
    text.includes("critical") ? "Critical" :
    text.includes("high") ? "High" :
    text.includes("moderate") ? "Moderate" : "Low";
  const devStage = inSet(lower(get("product_stage") ?? get("stage_product")), ["design", "development", "testing", "staging", "production"], "development");
  const hostingType = lower(get("hosting_deployment") ?? get("solution_hosted")).includes("hybrid")
    ? "hybrid"
    : lower(get("hosting_deployment") ?? get("solution_hosted")).includes("prem")
      ? "on_premise"
      : "cloud_hosted";
  const employeeCount =
    employeeRaw.includes("10000") ? "10000+" :
    employeeRaw.includes("5001") ? "5001-10000" :
    employeeRaw.includes("1001") ? "1001-5000" :
    employeeRaw.includes("201") ? "201-1000" :
    employeeRaw.includes("51") ? "51-200" :
    employeeRaw.includes("11") ? "11-50" : "1-10";
  const geographicRegions = regionCount >= 5 ? "global" : regionCount >= 3 ? "multi_national" : regionCount === 2 ? "national" : "regional";
  const complianceUploadNames = collectComplianceUploadFileNames(payload);
  const complianceUploadBlob = complianceUploadNames.join(" ").toLowerCase();
  const certFormBlob = certificationFormTextFromGetter(get).toLowerCase();
  const certificationsSearchBlob = `${certFormBlob} ${complianceUploadBlob}`.trim();
  const buyerIndustrySegment = normalizeCertIndustrySegmentInput(
    asStr(
      get("buyerIndustrySegment") ??
        get("buyer_industry_segment") ??
        get("industrySegment") ??
        get("industry_segment") ??
        get("buyerSegment") ??
        "",
    ),
  );
  return {
    likelihoodScores: [3, 3, 3],
    impactScores: [3, 3, 3],
    decisionAutonomyLevel,
    decisionStakeLevel,
    devStage,
    assessmentPhase: "vendor_evaluation",
    customizationLevel: "lightly_customized",
    integrationComplexity: "moderate_integration",
    hostingType,
    employeeCount,
    geographicRegions,
    dataVolumeScale: "moderate",
    aiRiskAppetite: "moderate",
    intentionalRiskCount: 1,
    unintentionalRiskCount: 2,
    applicableDomains: [
      { domain: "Privacy & Security", riskCount: 1 },
      { domain: "AI System Safety", riskCount: 1 },
      { domain: "Accountability & Governance", riskCount: 1 },
    ],
    sector: asStr(get("sector")) || "Technology",
    aiCapabilityType: "administrative",
    piiHandling: text.includes("critical") ? "critical" : "moderate",
    regulatoryComplexity: [],
    deploymentScale: lower(get("deployment_scale")) || "mid_market",
    patientDemographic: "general",
    requiredCategories: MITIGATION_CATEGORIES.slice(0, 6),
    implementedCategories: MITIGATION_CATEGORIES.slice(0, 4),
    mitigations: [{ mitigationId: "default", riskCount: 1, avgRelevance: 0.7 }],
    assessmentMethod: "internal_audit",
    complianceDocumentationComplete: true,
    penetrationTestReportAvailable: !!asStr(get("adversarial_security_testing")),
    soc2Type2Current:
      /\bsoc\s*2\b|soc2/i.test(certificationsSearchBlob) &&
      /type\s*2|type\s*ii|type2/i.test(certificationsSearchBlob),
    soc2Certification: /type\s*2|type\s*ii|type2/i.test(certificationsSearchBlob) ? "Type 2 (current)" : "None",
    isoCertifications: /\biso\s*27001\b|27001/i.test(certificationsSearchBlob) ? "ISO 27001 only" : "None",
    hipaaCertification:
      /hipaa/i.test(certificationsSearchBlob) && /hitrust/i.test(certificationsSearchBlob)
        ? "HIPAA BAA + HITRUST"
        : /hipaa|\bbaa\b/i.test(certificationsSearchBlob)
          ? "HIPAA BAA only"
          : "None",
    certificationsSearchBlob,
    complianceUploadBlob,
    buyerIndustrySegment,
    yearFounded,
    fundingStatus: "series_a",
    revenueSufficient: true,
    enterpriseCustomers: 5,
    auditFrequency: "annual",
    dataRetentionPolicy: !!asStr(get("data_retention_policy")),
    dataRetentionPolicyCompleteness: "documented_not_enforced",
    incidentResponsePlan: !!asStr(get("incident_response_plan")),
    incidentResponsePlanMaturity: "documented_not_tested",
    privacyPolicy: true,
    privacyPolicyScope: "standard",
    aiEthicsPolicy: true,
    aiEthicsMaturity: "documented_not_operationalized",
    rollbackProcedures: "manual_documented",
    humanOversightCapabilities: "monitoring_with_intervention",
    continuousMonitoring: "daily_dashboard",
    modelVersionControl: true,
    versioningMaturity: "manual_documented",
    slaUptime: asStr(get("uptime_sla") ?? get("sla_guarantee")) || "99.5-99.9%",
    criticalIncidentResponse: "< 4 hours",
    criticalIncidentResolution: "< 24 hours",
    planTesting: "annual_test",
    incidentCommunication: "email_notifications",
    multiTenancySupport: true,
    isolationMethod: "schema_isolation",
    financialStatus: "break_even",
    customerRetentionRate: 85,
    supportTiers: "business_hours_email",
    supportsHipaaWorkflows: lower(get("sector")).includes("health"),
    technicalAccountManager: "standard_support",
  };
}

function buildSectionsFromPayload(payload: Record<string, unknown>): ReportSection[] {
  const cp =
    payload.companyProfile && typeof payload.companyProfile === "object"
      ? (payload.companyProfile as Record<string, unknown>)
      : {};
  const get = (k: string) => payload[k] ?? cp[k];
  const text = (v: unknown) => (v == null || String(v).trim() === "" ? "Not specified" : String(v));
  const json = (v: unknown) => {
    if (v == null) return "Not specified";
    if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "Not specified";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const titleCase = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bSoc\b/g, "SOC")
      .replace(/\bHipaa\b/g, "HIPAA")
      .replace(/\bIso\b/g, "ISO")
      .replace(/\bGdpr\b/g, "GDPR");
  const certNameFromFile = (name: string): string => {
    const base = name
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const directPatterns: Array<{ re: RegExp; value: string }> = [
      { re: /\bSOC\s*2\b.*\bTYPE\s*2\b/i, value: "SOC 2 Type 2" },
      { re: /\bSOC\s*2\b.*\bTYPE\s*1\b/i, value: "SOC 2 Type 1" },
      { re: /\bSOC\s*2\b/i, value: "SOC 2" },
      { re: /\bHIPAA\b/i, value: "HIPAA" },
      { re: /\bHITRUST\b/i, value: "HITRUST" },
      { re: /\bISO\s*27001\b/i, value: "ISO 27001" },
      { re: /\bISO\s*42001\b/i, value: "ISO 42001" },
      { re: /\bISO\s*9001\b/i, value: "ISO 9001" },
      { re: /\bPCI(?:\s|-)?DSS\b/i, value: "PCI DSS" },
      { re: /\bGDPR\b/i, value: "GDPR" },
      { re: /\bCCPA\b/i, value: "CCPA" },
      { re: /\bFedRAMP\b/i, value: "FedRAMP" },
    ];
    for (const p of directPatterns) {
      if (p.re.test(base)) return p.value;
    }
    const cleaned = base
      .replace(/\b(report|assessment|compliance|security|certificate|certification|final|draft|version|v\d+)\b/gi, "")
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned ? titleCase(cleaned) : titleCase(base);
  };
  const targetIndustry = (() => {
    const raw = cp.sector ?? payload.sector;
    if (raw == null) return "Not specified";
    if (typeof raw === "object" && !Array.isArray(raw)) {
      const privateList = (raw as Record<string, unknown>).private_sector;
      if (Array.isArray(privateList)) {
        const values = privateList
          .map((x) => String(x).trim())
          .filter((x) => x.length > 0);
        return values.length > 0 ? values.join(", ") : "Not specified";
      }
      return "Not specified";
    }
    if (Array.isArray(raw)) {
      const values = raw.map((x) => String(x).trim()).filter((x) => x.length > 0);
      return values.length > 0 ? values.join(", ") : "Not specified";
    }
    if (typeof raw === "string") {
      const v = raw.trim();
      return v.length > 0 ? v : "Not specified";
    }
    return "Not specified";
  })();
  const docUploads =
    payload.document_uploads && typeof payload.document_uploads === "object"
      ? (payload.document_uploads as Record<string, unknown>)
      : (payload.documentUpload && typeof payload.documentUpload === "object"
          ? (payload.documentUpload as Record<string, unknown>)
          : null);
  const complianceUploadNames: string[] = [];
  if (docUploads && docUploads["2"] && typeof docUploads["2"] === "object" && !Array.isArray(docUploads["2"])) {
    const slot2 = docUploads["2"] as Record<string, unknown>;
    const byCategory =
      slot2.byCategory && typeof slot2.byCategory === "object" ? (slot2.byCategory as Record<string, unknown>) : {};
    Object.values(byCategory).forEach((arr) => {
      if (Array.isArray(arr)) {
        arr.forEach((name) => {
          if (typeof name === "string" && name.trim()) complianceUploadNames.push(name.trim());
        });
      }
    });
  }
  const explicitCerts = get("security_certifications") ?? get("security_compliance_certificates");
  const certificationsDisplay =
    explicitCerts != null && String(json(explicitCerts)).trim() !== "Not specified"
      ? json(explicitCerts)
      : (complianceUploadNames.length > 0
          ? Array.from(new Set(complianceUploadNames.map(certNameFromFile))).join(", ")
          : "Not specified");

  return [
    {
      id: 1,
      title: "Product Information",
      items: {
        "Product Name": text(get("product_name") ?? get("productName")),
        Version: text(get("model_version") ?? get("version")),
        "Primary Use Case": text(get("pain_points_solved") ?? get("pain_points")),
        "Target Industry": targetIndustry,
        "Deployment Model": json(get("hosting_deployment") ?? get("solution_hosted")),
        Pricing: text(get("pricing") ?? "Contact vendor"),
        "Product Description": text(
          get("product_description") ??
            get("unique_value_proposition") ??
            cp.companyDescription ??
            get("company_description"),
        ),
      },
    },
    {
      id: 2,
      title: "Company Overview",
      items: {
        "Legal Name": text(cp.vendorName ?? get("vendor_name")),
        "Vendor Type": text(cp.vendorType ?? get("vendorType")),
        "Year Founded": text(cp.yearFounded ?? get("yearFounded") ?? get("year_founded")),
        Employees: text(cp.employeeCount ?? get("employeeCount") ?? get("no_of_employees")),
        "Operating Regions": json(cp.operatingRegions ?? get("operatingRegions") ?? get("operate_regions")),
      },
    },
    {
      id: 3,
      title: "AI Models & Technology",
      items: {
        "Model Types": json(get("ai_model_types") ?? get("ai_models_usage")),
        "Model Purpose": json(get("ai_capabilities") ?? get("product_capabilities")),
        "Training Data / Transparency": text(get("model_transparency") ?? get("ai_model_transparency")),
        "Human Oversight": json(get("human_oversight")),
      },
    },
    {
      id: 4,
      title: "AI Governance",
      items: {
        "AI Ethics Policy": text(get("aiEthicsPolicy") ? "Available" : "Not specified"),
        "Bias Detection": json(get("bias_testing_approach") ?? get("bias_ai")),
        "Model Governance": text(get("ai_autonomy_level") ?? get("decision_autonomy")),
        "Human-in-the-Loop": json(get("human_oversight")),
      },
    },
    {
      id: 5,
      title: "Security Posture",
      items: {
        Certifications: json(get("security_certifications") ?? get("security_compliance_certificates")),
        "Penetration Testing": text(get("adversarial_security_testing") ?? get("security_testing")),
        "Incident Response": text(get("incident_response_plan")),
        "Uptime SLA": text(get("uptime_sla") ?? get("sla_guarantee")),
      },
    },
    {
      id: 6,
      title: "Data Practices",
      items: {
        "PII Handling": text(get("pii_handling") ?? get("pii_information")),
        "Data Retention": text(get("data_retention_policy")),
        "Data Residency": json(get("data_residency_options")),
      },
    },
    {
      id: 7,
      title: "Compliance & Certifications",
      items: {
        Certifications: certificationsDisplay,
        "Audit Frequency": text(get("audit_frequency") ?? get("assessment_completion_level") ?? get("assessment_feedback")),
      },
    },
    {
      id: 8,
      title: "Operations & Support",
      items: {
        "Support Hours": text(get("support_hours")),
        "Support SLAs": text(get("support_slas")),
        "Uptime SLA": text(get("uptime_sla") ?? get("sla_guarantee")),
        "Change Management": text(get("change_management") ?? get("deployment_scale") ?? get("stage_product")),
      },
    },
    {
      id: 9,
      title: "Vendor Management",
      items: {
        "Critical Vendors": text(get("critical_vendors")),
        "Vendor Assessment": text(get("vendor_assessment_frequency")),
      },
    },
  ];
}

function calculateLikelihood(likelihoodScores: number[]) {
  if (!likelihoodScores || likelihoodScores.length === 0) {
    throw new Error('likelihoodScores must be a non-empty array');
  }
  const value = likelihoodScores.reduce((a: number, b: number) => a + b, 0) / likelihoodScores.length;
  return {
    value: parseFloat(value.toFixed(4)),
    riskCount: likelihoodScores.length,
  };
}

function calculateImpact(impactScores: number[]) {
  if (!impactScores || impactScores.length === 0) {
    throw new Error('impactScores must be a non-empty array');
  }
  const value = impactScores.reduce((a: number, b: number) => a + b, 0) / impactScores.length;
  return {
    value: parseFloat(value.toFixed(4)),
    riskCount: impactScores.length,
  };
}

function calcEntityTypeMultiplier(p: LooseInput) {
  const baseMap: Record<string, number> = {
    advisory: 0.8,
    assisted: 0.9,
    supervised: 1.0,
    autonomous: 1.2,
    fully_autonomous: 1.3,
  };
  const stakeMap: Record<string, number> = {
    Low: -0.1,
    Moderate: 0.0,
    High: 0.1,
    Critical: 0.15,
    'Life-Critical': 0.2,
  };

  const base = baseMap[p.decisionAutonomyLevel];
  if (base === undefined) throw new Error(`Unknown decisionAutonomyLevel: ${p.decisionAutonomyLevel}`);
  const stakeAdj = stakeMap[p.decisionStakeLevel];
  if (stakeAdj === undefined) throw new Error(`Unknown decisionStakeLevel: ${p.decisionStakeLevel}`);

  return {
    et_base: base,
    stake_adjustment: stakeAdj,
    value: parseFloat((base + stakeAdj).toFixed(4)),
  };
}

function calcTimingMultiplier(p: LooseInput) {
  const baseMap: Record<string, number> = {
    design: 0.75,
    development: 0.80,
    testing: 0.85,
    staging: 0.95,
    production: 1.30,
  };
  const phaseMap: Record<string, number> = {
    pre_procurement: -0.05,
    vendor_evaluation: -0.03,
    pilot: 0.0,
    scaling: 0.05,
    mature_deployment: 0.10,
  };

  const base = baseMap[p.devStage];
  if (base === undefined) throw new Error(`Unknown devStage: ${p.devStage}`);
  const phaseAdj = phaseMap[p.assessmentPhase];
  if (phaseAdj === undefined) throw new Error(`Unknown assessmentPhase: ${p.assessmentPhase}`);

  return {
    tm_base: base,
    phase_adjustment: phaseAdj,
    value: parseFloat((base + phaseAdj).toFixed(4)),
  };
}

function calcArchitectureMultiplier(p: LooseInput) {
  const baseMap: Record<string, number> = {
    off_the_shelf: 0.70,
    lightly_customized: 0.85,
    moderately_customized: 1.00,
    heavily_customized: 1.20,
    fully_custom: 1.40,
  };
  const integMap: Record<string, number> = {
    standalone: 0.00,
    simple_api: 0.05,
    moderate_integration: 0.10,
    complex_integration: 0.15,
    legacy_systems: 0.20,
  };
  const hostMap: Record<string, number> = {
    cloud_hosted: 0.00,
    on_premise: 0.05,
    hybrid: 0.08,
    edge_devices: 0.10,
  };

  const base = baseMap[p.customizationLevel];
  if (base === undefined) throw new Error(`Unknown customizationLevel: ${p.customizationLevel}`);
  const integAdj = integMap[p.integrationComplexity];
  if (integAdj === undefined) throw new Error(`Unknown integrationComplexity: ${p.integrationComplexity}`);
  const hostAdj = hostMap[p.hostingType];
  if (hostAdj === undefined) throw new Error(`Unknown hostingType: ${p.hostingType}`);

  return {
    am_base: base,
    integration_adj: integAdj,
    hosting_adj: hostAdj,
    value: parseFloat((base + integAdj + hostAdj).toFixed(4)),
  };
}

function calcScaleMultiplier(p: LooseInput) {
  const empMap: Record<string, number> = {
    '1-10': 0.70,
    '11-50': 0.75,
    '51-200': 0.80,
    '201-1000': 0.90,
    '1001-5000': 1.00,
    '5001-10000': 1.10,
    '10000+': 1.20,
  };
  const geoMap: Record<string, number> = {
    single_location: 1.00,
    regional: 1.05,
    national: 1.10,
    multi_national: 1.15,
    global: 1.20,
  };
  const dataMap: Record<string, number> = {
    minimal: 0.00,
    moderate: 0.03,
    large: 0.06,
    very_large: 0.09,
    petabyte_scale: 0.12,
  };

  const empBase = empMap[p.employeeCount];
  if (empBase === undefined) throw new Error(`Unknown employeeCount: ${p.employeeCount}`);
  const geoFactor = geoMap[p.geographicRegions];
  if (geoFactor === undefined) throw new Error(`Unknown geographicRegions: ${p.geographicRegions}`);
  const dataAdj = dataMap[p.dataVolumeScale];
  if (dataAdj === undefined) throw new Error(`Unknown dataVolumeScale: ${p.dataVolumeScale}`);

  return {
    employee_base: empBase,
    geographic_factor: geoFactor,
    data_volume_adj: dataAdj,
    value: parseFloat(((empBase * geoFactor) + dataAdj).toFixed(4)),
  };
}


function calcRiskToleranceMultiplier(p: LooseInput) {
  const map: Record<string, number> = {
    aggressive: 0.85,
    moderate: 1.00,
    conservative: 1.15,
    risk_averse: 1.25,
  };
  const value = map[p.aiRiskAppetite];
  if (value === undefined) throw new Error(`Unknown aiRiskAppetite: ${p.aiRiskAppetite}`);
  return { value };
}

function calcIntentMultiplier(p: LooseInput) {
  const total = p.intentionalRiskCount + p.unintentionalRiskCount;
  if (total === 0) throw new Error('Total risk count must be > 0 for intent multiplier');

  const intentionalPct = p.intentionalRiskCount / total;
  const unintentionalPct = p.unintentionalRiskCount / total;

  let value, profile;
  if (intentionalPct > 0.6) { value = 1.2; profile = 'Intentional'; }
  else if (unintentionalPct > 0.6) { value = 0.7; profile = 'Unintentional'; }
  else { value = 1.0; profile = 'Mixed'; }

  return {
    intentional_count: p.intentionalRiskCount,
    unintentional_count: p.unintentionalRiskCount,
    intentional_pct: parseFloat((intentionalPct * 100).toFixed(2)),
    unintentional_pct: parseFloat((unintentionalPct * 100).toFixed(2)),
    profile,
    value,
  };
}

function calculateCombinedContextualMultiplier(params: LooseInput) {
  const ET = calcEntityTypeMultiplier(params);
  const TM = calcTimingMultiplier(params);
  const AM = calcArchitectureMultiplier(params);
  const SM = calcScaleMultiplier(params);
  const RTM = calcRiskToleranceMultiplier(params);
  const IM = calcIntentMultiplier(params);

  const value = parseFloat(
    (ET.value * TM.value * AM.value * SM.value * RTM.value * IM.value).toFixed(4)
  );

  return {
    entity_type_multiplier: ET,
    timing_multiplier: TM,
    architecture_multiplier: AM,
    scale_multiplier: SM,
    risk_tolerance_multiplier: RTM,
    intent_multiplier: IM,
    value,
  };
}

const DOMAIN_WEIGHTS: Record<string, number> = {
  'Privacy & Security': 1.20,
  'AI System Safety': 1.20,
  'Fairness & Non-discrimination': 1.15,
  'Transparency & Explainability': 1.10,
  'Human Oversight': 1.10,
  'Accountability & Governance': 1.00,
  'Socioeconomic Impact': 0.90,
};

function calculateDomainWeight(applicableDomains: Array<{ domain: string; riskCount: number }>) {
  if (!applicableDomains || applicableDomains.length === 0) {
    throw new Error('applicableDomains must be a non-empty array');
  }

  let weightedSum = 0;
  let totalRisks = 0;
  const breakdown = [];

  for (const d of applicableDomains) {
    const w = DOMAIN_WEIGHTS[d.domain];
    if (w === undefined) throw new Error(`Unknown domain: ${d.domain}`);
    weightedSum += w * d.riskCount;
    totalRisks += d.riskCount;
    breakdown.push({ domain: d.domain, weight: w, risk_count: d.riskCount, contribution: parseFloat((w * d.riskCount).toFixed(4)) });
  }

  const value = parseFloat((weightedSum / totalRisks).toFixed(4));
  return { breakdown, weighted_sum: parseFloat(weightedSum.toFixed(4)), total_risks: totalRisks, value };
}


function calculateSectorModifier(p: LooseInput) {
  let smBase = 0;
  let useCaseAdj = 0;
  const adjBreakdown = [];

  switch (p.sector) {
    case 'Healthcare': {
      const capMap: Record<string, number> = {
        diagnostic: 8,
        treatment_recommendation: 8,
        patient_communication: 6,
        administrative: 4,
        research: 3,
      };
      smBase = capMap[p.aiCapabilityType] ?? 5;

      if (p.piiHandling === 'critical') { useCaseAdj += 2; adjBreakdown.push({ reason: 'critical PHI handling', points: 2 }); }
      if (p.regulatoryComplexity && p.regulatoryComplexity.includes('FDA_clearance')) { useCaseAdj += 1; adjBreakdown.push({ reason: 'FDA clearance required', points: 1 }); }
      if (p.deploymentScale === 'multi_hospital_system') { useCaseAdj += 1; adjBreakdown.push({ reason: 'multi-hospital deployment', points: 1 }); }
      if (p.patientDemographic === 'pediatric' || p.patientDemographic === 'elderly') { useCaseAdj += 1; adjBreakdown.push({ reason: 'vulnerable population', points: 1 }); }
      break;
    }
    case 'Financial Services': smBase = 5; break;
    case 'Autonomous Vehicles': smBase = 6; break;
    case 'Government': smBase = 5; break;
    case 'E-Commerce': smBase = 3; break;
    case 'Technology': smBase = 1; break;
    default: smBase = 1;
  }

  return {
    sector: p.sector,
    sm_base: smBase,
    use_case_adjustment: useCaseAdj,
    adjustment_breakdown: adjBreakdown,
    value: smBase + useCaseAdj,
  };
}


function calculateInherentRisk({ L, I, CM, DW, SM }: { L: number; I: number; CM: number; DW: number; SM: number }) {
  const baseRisk = parseFloat((L * I).toFixed(4));
  const contextualRisk = parseFloat((baseRisk * CM).toFixed(4));
  const domainWeightedRisk = parseFloat((contextualRisk * DW).toFixed(4));
  const sectorAdjustedRisk = parseFloat((domainWeightedRisk + SM).toFixed(4));
  const normalizedRisk = parseFloat((sectorAdjustedRisk * 4).toFixed(4));
  const cappedRisk = Math.min(100, normalizedRisk);

  return {
    base_risk: baseRisk,
    contextual_risk: contextualRisk,
    domain_weighted_risk: domainWeightedRisk,
    sector_adjusted_risk: sectorAdjustedRisk,
    normalized_risk: normalizedRisk,
    value: parseFloat(cappedRisk.toFixed(4)),
  };
}


const MITIGATION_CATEGORIES = [
  'Data Governance & Privacy Controls',
  'Model Security & Integrity',
  'Access Management & Authentication',
  'Testing & Auditing Procedures',
  'Post-Deployment Monitoring',
  'Incident Response & Recovery',
  'Transparency & Documentation',
  'Human Oversight Mechanisms',
  'Bias Detection & Mitigation',
  'Adversarial Robustness',
  'Supply Chain Security',
  'Compliance & Regulatory Adherence',
  'User Education & Awareness',
];

function calcCategoryCoverage(p: LooseInput) {
  const requiredCategories = (p.requiredCategories ?? []) as string[];
  const implementedCategories = (p.implementedCategories ?? []) as string[];
  const required = new Set<string>(requiredCategories);
  const implemented = implementedCategories.filter((c: string) => required.has(c));
  const coverage = implemented.length / required.size;

  return {
    required_categories: [...required],
    required_count: required.size,
    implemented_categories: implemented,
    implemented_count: implemented.length,
    missing_categories: [...required].filter((c: string) => !implemented.includes(c)),
    value: parseFloat(coverage.toFixed(4)),
  };
}

function calcEvidenceQuality(mitigations: Array<{ mitigationId: string; riskCount: number; avgRelevance: number }>) {
  if (!mitigations || mitigations.length === 0) {
    throw new Error('mitigations array must be non-empty');
  }

  let weightedSum = 0;
  let totalRiskInstances = 0;
  const breakdown = [];

  for (const m of mitigations) {
    const contribution = m.riskCount * m.avgRelevance;
    weightedSum += contribution;
    totalRiskInstances += m.riskCount;
    breakdown.push({
      mitigation_id: m.mitigationId,
      risk_count: m.riskCount,
      avg_relevance: m.avgRelevance,
      weighted_contribution: parseFloat(contribution.toFixed(4)),
    });
  }

  return {
    breakdown,
    total_weighted: parseFloat(weightedSum.toFixed(4)),
    total_risk_instances: totalRiskInstances,
    value: parseFloat((weightedSum / totalRiskInstances).toFixed(4)),
  };
}

function calculateMitigationEffectiveness(p: LooseInput) {
  const coverage = calcCategoryCoverage(p);
  const quality = calcEvidenceQuality(p.mitigations);

  const value = parseFloat(((coverage.value * 0.6) + (quality.value * 0.4)).toFixed(4));

  return {
    category_coverage: coverage,
    evidence_quality: quality,
    coverage_weight: 0.6,
    quality_weight: 0.4,
    value,
  };
}

function calculateConfidenceFactor(p: LooseInput) {
  const methodMap: Record<string, number> = {
    third_party_audit: 0.90,
    third_party_review: 0.93,
    internal_audit: 0.97,
    self_reported_verified: 1.00,
    self_reported_unverified: 1.10,
    no_formal_assessment: 1.15,
  };

  const base = methodMap[p.assessmentMethod];
  if (base === undefined) throw new Error(`Unknown assessmentMethod: ${p.assessmentMethod}`);

  const evidenceAdj = [];
  let factor = base;

  if (p.complianceDocumentationComplete === true) { factor *= 0.98; evidenceAdj.push({ reason: 'compliance documentation complete', multiplier: 0.98 }); }
  if (p.penetrationTestReportAvailable === true)  { factor *= 0.97; evidenceAdj.push({ reason: 'penetration test report available', multiplier: 0.97 }); }
  if (p.soc2Type2Current === true)                { factor *= 0.95; evidenceAdj.push({ reason: 'SOC2 Type 2 current', multiplier: 0.95 }); }

  return {
    method_base: base,
    evidence_adjustments: evidenceAdj,
    value: parseFloat(factor.toFixed(4)),
  };
}

function calculateProductRisk({ inherentRisk, mitigationEffectiveness, confidenceFactor }: { inherentRisk: number; mitigationEffectiveness: number; confidenceFactor: number }) {
  const residual = inherentRisk * (1 - mitigationEffectiveness);
  const value = parseFloat((residual * confidenceFactor).toFixed(4));
  return {
    inherent_risk: inherentRisk,
    mitigation_effectiveness: mitigationEffectiveness,
    residual_pre_confidence: parseFloat(residual.toFixed(4)),
    confidence_factor: confidenceFactor,
    value,
  };
}

/** Vendor trust certifications matrix (Certified / Self-Attested points). Capped when summed for governance balance. */

const CERT_EVIDENCE_NEAR_FW =
  /(certif|certificate|audit|report|attestation|third[\s-]?party|external assessment|assessor|aico|\.pdf|\.docx?)/i;

/** True if an evidence keyword appears near a regex match in `combined` (avoids unrelated "audit" elsewhere). */
function certifiedEvidenceNearFramework(combined: string, fwRegex: RegExp): boolean {
  const re = new RegExp(fwRegex.source, fwRegex.flags.includes("g") ? fwRegex.flags : `${fwRegex.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined)) !== null) {
    const idx = m.index;
    const winStart = Math.max(0, idx - 100);
    const winEnd = Math.min(combined.length, idx + m[0].length + 100);
    if (CERT_EVIDENCE_NEAR_FW.test(combined.slice(winStart, winEnd))) return true;
  }
  return false;
}

function calcCertificationsScore(p: LooseInput) {
  let combined = String(p.certificationsSearchBlob ?? "").toLowerCase();
  const u = String(p.complianceUploadBlob ?? "").toLowerCase();
  if (!combined.trim()) {
    const legacy: string[] = [];
    if (p.soc2Certification && p.soc2Certification !== "None") legacy.push(String(p.soc2Certification));
    if (p.isoCertifications && p.isoCertifications !== "None") legacy.push(String(p.isoCertifications));
    if (p.hipaaCertification && p.hipaaCertification !== "None") legacy.push(String(p.hipaaCertification));
    combined = legacy.join(" ").toLowerCase();
  }

  const breakdown: Record<string, number | string>[] = [];

  const add = (key: string, pts: number, detail?: string) => {
    if (pts <= 0) return;
    breakdown.push({ framework: key, points: pts, ...(detail ? { detail } : {}) });
  };

  // SOC 2 — certified only (no self-attested column)
  let soc2Points = 0;
  const hasSoc2 = /\bsoc\s*2\b|soc2/i.test(combined);
  if (hasSoc2) {
    if (/type\s*2|type\s*ii|type2/i.test(combined)) soc2Points = 15;
    else if (/type\s*1|type\s*i\b|type1/i.test(combined)) soc2Points = 8;
  }
  if (soc2Points === 15) add("SOC 2 Type 2", 15);
  else if (soc2Points === 8) add("SOC 2 Type 1", 8);

  // HIPAA — scored only when buyer segment lists HIPAA in CERT_RELEVANCE_FRAMEWORKS_BY_SEGMENT
  let hipaaPoints = 0;
  if (/hipaa/i.test(combined) && /hitrust/i.test(combined)) {
    hipaaPoints = 15;
    add("HIPAA BAA + HITRUST", 15);
  } else if (/hipaa|\bbaa\b/i.test(combined)) {
    hipaaPoints = 10;
    add("HIPAA BAA only", 10);
  }

  // ISO 27001:2022 — 10 / 5
  let iso27001Points = 0;
  const iso27001Re = /\biso\s*27001\b|27001:2022|\b27001\b/i;
  if (iso27001Re.test(combined)) {
    const uploadHint = /27001/i.test(u);
    const certified = uploadHint || certifiedEvidenceNearFramework(combined, iso27001Re);
    iso27001Points = certified ? 10 : 5;
    add("ISO 27001:2022", iso27001Points, certified ? "certified" : "self-attested");
  }

  // ISO 42001 — 8 / 4
  let iso42001Points = 0;
  const iso42001Re = /\biso\s*42001\b|\b42001\b/i;
  if (iso42001Re.test(combined)) {
    const uploadHint = /42001/i.test(u);
    const certified = uploadHint || certifiedEvidenceNearFramework(combined, iso42001Re);
    iso42001Points = certified ? 8 : 4;
    add("ISO 42001", iso42001Points, certified ? "certified" : "self-attested");
  }

  // NIST AI RMF — self 5 only
  if (/nist/i.test(combined) && /ai\s*rmf|ai\s*risk\s*management(\s*framework)?/i.test(combined)) {
    add("NIST AI RMF", 5, "self-attested");
  }

  // NIST CSF v2.0 — self 5 only
  if (
    /nist/i.test(combined) &&
    /(\bcsf\b|cybersecurity\s*framework)/i.test(combined) &&
    !/800[\s.-]*53/.test(combined) &&
    !/800[\s.-]*171/.test(combined)
  ) {
    add("NIST CSF v2.0", 5, "self-attested");
  }

  // NIST SP 800-53 Rev 5 — 10 / 5
  const n53Re = /800[\s.-]*53\b/i;
  if (n53Re.test(combined)) {
    const uploadHint = /800[\s.-]*53/i.test(u);
    const certified = uploadHint || certifiedEvidenceNearFramework(combined, n53Re);
    const pts = certified ? 10 : 5;
    add("NIST SP 800-53 Rev 5", pts, certified ? "certified" : "self-attested");
  }

  // NIST SP 800-171 Rev 3 — 10 / 5
  const n171Re = /800[\s.-]*171\b/i;
  if (n171Re.test(combined)) {
    const uploadHint = /800[\s.-]*171/i.test(u);
    const certified = uploadHint || certifiedEvidenceNearFramework(combined, n171Re);
    const pts = certified ? 10 : 5;
    add("NIST SP 800-171 Rev 3", pts, certified ? "certified" : "self-attested");
  }

  // CMMC v2 Level 2+ — 12 certified only
  if (/\bcmmc\b/i.test(combined)) add("CMMC v2 Level 2+", 12);

  // PCI DSS 4.0 — 10 certified only
  if (/pci[\s.-]*dss|payment card industry/i.test(combined)) add("PCI DSS 4.0", 10);

  // DORA — 8 / 4
  const doraRe = /\bdora\b|digital operational resilience/i;
  if (doraRe.test(combined)) {
    const uploadHint = /\bdora\b/i.test(u) || /digital operational resilience/i.test(u);
    const certified = uploadHint || certifiedEvidenceNearFramework(combined, doraRe);
    const pts = certified ? 8 : 4;
    add("DORA", pts, certified ? "certified" : "self-attested");
  }

  // GDPR — 8 / 4
  const gdprRe = /\bgdpr\b|general data protection regulation/i;
  if (gdprRe.test(combined)) {
    const uploadHint = /\bgdpr\b/i.test(u);
    const certified = uploadHint || certifiedEvidenceNearFramework(combined, gdprRe);
    const pts = certified ? 8 : 4;
    add("GDPR", pts, certified ? "certified" : "self-attested");
  }

  const segmentKey = normalizeCertIndustrySegmentInput(String(p.buyerIndustrySegment ?? ""));
  const relevantFrameworks = getRelevantCertificationFrameworkSet(segmentKey);

  const allRows = breakdown;
  const allDetectedBreakdown = allRows.map((row) => ({ ...row }));
  const contributing = allRows.filter((row) => relevantFrameworks.has(String(row.framework)));
  const excludedBySegment = allRows.filter((row) => !relevantFrameworks.has(String(row.framework)));

  const rawSumAll = allRows.reduce((acc, row) => acc + (row.points as number), 0);
  const rawSum = contributing.reduce((acc, row) => acc + (row.points as number), 0);
  const value = Math.min(CERTIFICATIONS_SCORE_CAP, rawSum);

  const soc2Contrib = contributing.find((r) => r.framework === "SOC 2 Type 2")
    ? 15
    : contributing.some((r) => r.framework === "SOC 2 Type 1")
      ? 8
      : 0;
  const hipaaContrib = contributing.some((r) => r.framework === "HIPAA BAA + HITRUST")
    ? 15
    : contributing.some((r) => r.framework === "HIPAA BAA only")
      ? 10
      : 0;
  const iso27001Contrib = Number(contributing.find((r) => r.framework === "ISO 27001:2022")?.points ?? 0);
  const iso42001Contrib = Number(contributing.find((r) => r.framework === "ISO 42001")?.points ?? 0);

  return {
    buyer_industry_segment: segmentKey,
    relevant_framework_keys: [...relevantFrameworks].sort(),
    all_detected_breakdown: allDetectedBreakdown,
    framework_breakdown: contributing,
    excluded_not_relevant_to_buyer_segment: excludedBySegment,
    raw_certifications_sum_all_detected: rawSumAll,
    raw_certifications_sum: rawSum,
    certifications_cap: CERTIFICATIONS_SCORE_CAP,
    soc2_points: soc2Contrib,
    hipaa_points: hipaaContrib,
    iso_points: Number(iso27001Contrib) + Number(iso42001Contrib),
    iso_27001_points: iso27001Contrib,
    iso_42001_points: iso42001Contrib,
    value,
  };
}

function calcAssessmentQualityScore(p: LooseInput) {
  const methodMap: Record<string, number> = {
    third_party_audit: 20,
    third_party_review: 15,
    internal_audit: 10,
    internal_review: 8,
    self_assessment: 3,
    none: 0,
  };
  const freqMap: Record<string, number> = { annual: 5, bi_annual: 3, ad_hoc: 0 };

  const base = methodMap[p.assessmentMethod] ?? 0;
  const isAudit = ['third_party_audit', 'internal_audit'].includes(p.assessmentMethod);
  const freqBonus = isAudit ? (freqMap[p.auditFrequency] ?? 0) : 0;

  return { method_base: base, frequency_bonus: freqBonus, value: base + freqBonus };
}

function calcPolicyScore(p: LooseInput) {
  const retentionMap: Record<string, number> = { documented_and_enforced: 12, documented_not_enforced: 8, informal: 3 };
  const irMap: Record<string, number> = { tested_annually: 15, documented_not_tested: 10, basic_runbook: 5 };
  const privacyMap: Record<string, number> = { comprehensive_gdpr_ccpa: 10, standard: 6, basic: 3 };
  const ethicsMap: Record<string, number> = { board_approved_operationalized: 8, documented_not_operationalized: 5, draft: 2 };

  const retentionPoints = p.dataRetentionPolicy ? (retentionMap[p.dataRetentionPolicyCompleteness] ?? 0) : 0;
  const irPoints        = p.incidentResponsePlan ? (irMap[p.incidentResponsePlanMaturity] ?? 0) : 0;
  const privacyPoints   = p.privacyPolicy ? (privacyMap[p.privacyPolicyScope] ?? 0) : 0;
  const ethicsPoints    = p.aiEthicsPolicy ? (ethicsMap[p.aiEthicsMaturity] ?? 0) : 0;

  return {
    data_retention_points: retentionPoints,
    incident_response_points: irPoints,
    privacy_policy_points: privacyPoints,
    ai_ethics_points: ethicsPoints,
    value: retentionPoints + irPoints + privacyPoints + ethicsPoints,
  };
}

function calcOperationalControlsScore(p: LooseInput) {
  const rollbackMap: Record<string, number> = { automated_instant: 15, automated_manual_trigger: 12, manual_documented: 8, manual_undocumented: 3, none: 0 };
  const oversightMap: Record<string, number> = { always_in_loop: 12, monitoring_with_intervention: 10, monitoring_only: 6, minimal: 3, none: 0 };
  const monitorMap: Record<string, number> = { real_time_alerting: 10, daily_dashboard: 7, weekly_reports: 4, monthly_reviews: 2, none: 0 };
  const versionMap: Record<string, number> = { automated_mlops_pipeline: 8, manual_documented: 5, basic_tracking: 2 };

  const rollbackPts  = rollbackMap[p.rollbackProcedures] ?? 0;
  const oversightPts = oversightMap[p.humanOversightCapabilities] ?? 0;
  const monitorPts   = monitorMap[p.continuousMonitoring] ?? 0;
  const versionPts   = p.modelVersionControl ? (versionMap[p.versioningMaturity] ?? 0) : 0;

  return {
    rollback_points: rollbackPts,
    oversight_points: oversightPts,
    monitoring_points: monitorPts,
    version_control_points: versionPts,
    value: rollbackPts + oversightPts + monitorPts + versionPts,
  };
}

function calcVendorMaturityAdjustment(p: LooseInput) {
  const currentYear = new Date().getFullYear();
  const age = currentYear - p.yearFounded;

  const ageMap = [
    { min: 10, points: 10 },
    { min: 5,  points: 5  },
    { min: 3,  points: 0  },
    { min: 1,  points: -5 },
    { min: 0,  points: -10 },
  ];
  const agePts = ageMap.find((e: { min: number; points: number }) => age >= e.min)?.points ?? -10;

  const sizeMap: Record<string, number> = { '5001+': 8, '1001-5000': 5, '201-1000': 2, '51-200': 0, '11-50': -3, '1-10': -5 };
  const sizePts = sizeMap[p.employeeCount] ?? 0;

  const fundingMap: Record<string, number> = { publicly_traded: 7, series_d_plus: 5, series_b_c: 2, series_a: 0, seed_angel: -3 };
  let fundingPts;
  if (p.fundingStatus === 'bootstrapped') {
    fundingPts = p.revenueSufficient ? 3 : -2;
  } else {
    fundingPts = fundingMap[p.fundingStatus] ?? 0;
  }

  const ec = p.enterpriseCustomers ?? 0;
  const custPts = ec > 10 ? Math.min(10, ec / 2) : (ec - 5);

  return {
    company_age_years: age,
    company_age_factor: agePts,
    company_size_factor: sizePts,
    funding_stability_factor: fundingPts,
    customer_base_factor: parseFloat(custPts.toFixed(4)),
    value: parseFloat((agePts + sizePts + fundingPts + custPts).toFixed(4)),
  };
}

function calculateGovernanceRisk(p: LooseInput) {
  const cert   = calcCertificationsScore(p);
  const aq     = calcAssessmentQualityScore(p);
  const policy = calcPolicyScore(p);
  const ops    = calcOperationalControlsScore(p);
  const mat    = calcVendorMaturityAdjustment(p);

  const rawScore      = cert.value + aq.value + policy.value + ops.value + mat.value;
  const governanceScore = Math.min(100, rawScore);
  const governanceRisk  = 100 - governanceScore;

  return {
    certifications_score: cert,
    assessment_quality_score: aq,
    policy_score: policy,
    operational_controls_score: ops,
    vendor_maturity_adjustment: mat,
    raw_governance_score: parseFloat(rawScore.toFixed(4)),
    governance_score: parseFloat(governanceScore.toFixed(4)),
    value: parseFloat(governanceRisk.toFixed(4)),
  };
}

function calcSlaScore(p: LooseInput) {
  const uptimeMap: Record<string, number> = { '99.99%+': 25, '99.95-99.99%': 22, '99.9-99.95%': 20, '99.5-99.9%': 15, '99.0-99.5%': 12, '95.0-99.0%': 8, '< 95%': 3 };
  const responseMap: Record<string, number> = { '< 15 minutes': 8, '< 1 hour': 6, '< 4 hours': 4, '< 24 hours': 2, '> 24 hours': 0 };
  const resolutionMap: Record<string, number> = { '< 4 hours': 7, '< 24 hours': 5, '< 72 hours': 3, '> 72 hours': 1 };

  const uptimePts     = uptimeMap[p.slaUptime] ?? 0;
  const responsePts   = responseMap[p.criticalIncidentResponse] ?? 0;
  const resolutionPts = resolutionMap[p.criticalIncidentResolution] ?? 0;

  return { uptime_points: uptimePts, response_time_points: responsePts, resolution_time_points: resolutionPts, value: uptimePts + responsePts + resolutionPts };
}


function calcIncidentManagementScore(p: LooseInput) {
  const planMap: Record<string, number>  = { quarterly_drills: 12, annual_test: 10, documented_untested: 6 };
  const autoMap: Record<string, number>  = { automated: 10, semi_automated: 7, manual: 3, none: 0 };
  const commMap: Record<string, number>  = { proactive_status_page: 8, email_notifications: 5, reactive_only: 2, none: 0 };

  const planPts  = p.incidentResponsePlan ? (planMap[p.planTesting] ?? 0) : 0;
  const autoPts  = autoMap[p.rollbackProcedures] ?? 0;
  const commPts  = commMap[p.incidentCommunication] ?? 0;

  return { plan_points: planPts, automation_points: autoPts, communication_points: commPts, value: planPts + autoPts + commPts };
}


function calcDeploymentMaturityScore(p: LooseInput) {
  const scaleMap: Record<string, number> = { enterprise_multi_tenant: 12, enterprise_single_tenant: 10, mid_market: 7, small_business: 4, pilot: 2 };
  const readinessMap: Record<string, number> = { production_mature: 10, production_new: 8, staging: 4, development: 1 };
  const isoMap: Record<string, number> = { full_instance_isolation: 8, schema_isolation: 6, row_level_security: 4 };

  const scalePts     = scaleMap[p.deploymentScale] ?? 0;
  const readinessPts = readinessMap[p.devStage] ?? 0;
  const multiPts     = p.multiTenancySupport ? (isoMap[p.isolationMethod] ?? 0) : 0;

  return { scale_points: scalePts, production_readiness_points: readinessPts, multi_tenancy_points: multiPts, value: scalePts + readinessPts + multiPts };
}


function calcStabilityScore(p: LooseInput) {
  const currentYear = new Date().getFullYear();
  const age = currentYear - p.yearFounded;

  const ageMap = [{ min: 10, pts: 12 }, { min: 5, pts: 9 }, { min: 3, pts: 6 }, { min: 1, pts: 3 }, { min: 0, pts: 0 }];
  const agePts = ageMap.find((e: { min: number; pts: number }) => age >= e.min)?.pts ?? 0;

  const finMap: Record<string, number> = { profitable_3_years: 10, profitable_1_year: 7, break_even: 5, funded_runway_2_years: 4, funded_runway_1_year: 2, uncertain: 0 };
  const finPts = finMap[p.financialStatus] ?? 0;

  let retentionPts;
  if (p.customerRetentionRate === undefined || p.customerRetentionRate === null) {
    retentionPts = 3;
  } else if (p.customerRetentionRate >= 95) { retentionPts = 8; }
  else if (p.customerRetentionRate >= 90)   { retentionPts = 6; }
  else if (p.customerRetentionRate >= 80)   { retentionPts = 4; }
  else if (p.customerRetentionRate >= 70)   { retentionPts = 2; }
  else                                       { retentionPts = 0; }

  return { company_age_years: age, company_age_points: agePts, financial_health_points: finPts, customer_retention_points: retentionPts, value: agePts + finPts + retentionPts };
}


function calcSupportScore(p: LooseInput) {
  const tierMap: Record<string, number> = { '24_7_phone_chat_email': 10, 'business_hours_phone_chat': 7, 'business_hours_email': 4, 'email_only': 2 };
  const tamMap: Record<string, number>  = { dedicated_tam: 5, shared_tam: 3, standard_support: 1 };

  const tierPts    = tierMap[p.supportTiers] ?? 0;
  const coveragePts = p.supportsHipaaWorkflows ? 5 : 0;
  const tamPts     = tamMap[p.technicalAccountManager] ?? 0;

  return { support_tier_points: tierPts, coverage_points: coveragePts, expertise_points: tamPts, value: tierPts + coveragePts + tamPts };
}

function calculateOperationalRisk(p: LooseInput) {
  const sla        = calcSlaScore(p);
  const incident   = calcIncidentManagementScore(p);
  const deployment = calcDeploymentMaturityScore(p);
  const stability  = calcStabilityScore(p);
  const support    = calcSupportScore(p);

  const rawScore        = sla.value + incident.value + deployment.value + stability.value + support.value;
  const operationalScore = Math.min(100, rawScore);
  const operationalRisk  = 100 - operationalScore;

  return {
    sla_score: sla,
    incident_management_score: incident,
    deployment_maturity_score: deployment,
    stability_score: stability,
    support_score: support,
    raw_operational_score: parseFloat(rawScore.toFixed(4)),
    operational_score: parseFloat(operationalScore.toFixed(4)),
    value: parseFloat(operationalRisk.toFixed(4)),
  };
}

function interpretTrustScore(vts: number) {
  const s = Math.max(0, Math.min(100, Math.round(Number(vts))));
  if (s >= 90) return { grade:"A",classification: 'Exceptional Vendor', recommended_action: 'Fast-track procurement; minimal additional due diligence',vendor_profile:'Market leader; comprehensive controls; proven track record' };
  if (s >= 80) return { grade:"B",classification: 'Trusted Vendor',     recommended_action: 'Standard procurement process; focus on use-case fit', vendor_profile:'Strong capabilities; mature governance; reliable operations' };
  if (s >= 70) return { grade:"C",classification: 'Acceptable Vendor',  recommended_action: 'Enhanced due diligence; require mitigation roadmap', vendor_profile:'Moderate capabilities; some gaps; growing operations' };
  if (s >= 60) return { grade:"D",classification: 'Review Recommended',   recommended_action: 'Extensive validation; consider alternatives; pilot only',vendor_profile:'Significant gaps; immature processes; limited track record' };
  return              { grade:"E",classification: 'Review Required', recommended_action: 'Reject; only consider for low-stakes non-production use',vendor_profile:'Critical deficiencies; unproven capabilities; high risk ' };
}

function calculateVendorTrustScore(userInput: LooseInput) {
  // ── Product Risk ──────────────────────────────────────────────────────────
  const L_result  = calculateLikelihood(userInput.likelihoodScores);
  const I_result  = calculateImpact(userInput.impactScores);
  const CM_result = calculateCombinedContextualMultiplier(userInput);
  const DW_result = calculateDomainWeight(userInput.applicableDomains);
  const SM_result = calculateSectorModifier(userInput);
  const IR_result = calculateInherentRisk({
    L: L_result.value,
    I: I_result.value,
    CM: CM_result.value,
    DW: DW_result.value,
    SM: SM_result.value,
  });
  const ME_result = calculateMitigationEffectiveness(userInput);
  const CF_result = calculateConfidenceFactor(userInput);
  const PR_result = calculateProductRisk({
    inherentRisk:          IR_result.value,
    mitigationEffectiveness: ME_result.value,
    confidenceFactor:      CF_result.value,
  });

  // ── Governance Risk ───────────────────────────────────────────────────────
  const GR_result = calculateGovernanceRisk(userInput);

  // ── Operational Risk ──────────────────────────────────────────────────────
  const OR_result = calculateOperationalRisk(userInput);

  // ── Final VTS ─────────────────────────────────────────────────────────────
  const weightedRisk = (PR_result.value * 0.40) + (GR_result.value * 0.30) + (OR_result.value * 0.30);
  const vts = parseFloat(Math.max(0, 100 - weightedRisk).toFixed(2));
  const interpretation = interpretTrustScore(vts);

  // ── DB-ready result ───────────────────────────────────────────────────────\
  return {
    // Top-level scores (store these as primary columns)
    vendor_trust_score:   vts,
    product_risk:         PR_result.value,
    governance_risk:      GR_result.value,
    operational_risk:     OR_result.value,
    weighted_risk:        parseFloat(weightedRisk.toFixed(4)),
    grade:                interpretation.grade,
    classification:       interpretation.classification,
    recommended_action:   interpretation.recommended_action,

    // Full intermediate breakdown (store as JSONB / TEXT column)
    detail: {
      product_risk: {
        likelihood:              L_result,
        impact:                  I_result,
        combined_contextual_multiplier: CM_result,
        domain_weight:           DW_result,
        sector_modifier:         SM_result,
        inherent_risk:           IR_result,
        mitigation_effectiveness: ME_result,
        confidence_factor:       CF_result,
        product_risk:            PR_result,
      },
      governance_risk:   GR_result,
      operational_risk:  OR_result,
      final_formula: {
        expression: 'VTS = 100 - [(PR × 0.40) + (GR × 0.30) + (OR × 0.30)]',
        product_risk_contribution:    parseFloat((PR_result.value * 0.40).toFixed(4)),
        governance_risk_contribution: parseFloat((GR_result.value * 0.30).toFixed(4)),
        operational_risk_contribution:parseFloat((OR_result.value * 0.30).toFixed(4)),
      },
    },
  };
}

export {
  // Main entry point
  calculateVendorTrustScore,

  // Individual calculators (useful for partial assessments / unit tests)
  calculateLikelihood,
  calculateImpact,
  calcEntityTypeMultiplier,
  calcTimingMultiplier,
  calcArchitectureMultiplier,
  calcScaleMultiplier,
  calcRiskToleranceMultiplier,
  calcIntentMultiplier,
  calculateCombinedContextualMultiplier,
  calculateDomainWeight,
  calculateSectorModifier,
  calculateInherentRisk,
  calcCategoryCoverage,
  calcEvidenceQuality,
  calculateMitigationEffectiveness,
  calculateConfidenceFactor,
  calculateProductRisk,
  calcCertificationsScore,
  calcAssessmentQualityScore,
  calcPolicyScore,
  calcOperationalControlsScore,
  calcVendorMaturityAdjustment,
  calculateGovernanceRisk,
  calcSlaScore,
  calcIncidentManagementScore,
  calcDeploymentMaturityScore,
  calcStabilityScore,
  calcSupportScore,
  calculateOperationalRisk,

  // Constants
  DOMAIN_WEIGHTS,
  MITIGATION_CATEGORIES,
};


