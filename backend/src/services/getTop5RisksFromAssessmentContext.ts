import { db } from "../database/db.js";
import { sql, inArray } from "drizzle-orm";
import { riskTop5Mitigations } from "../schema/risks/riskTop5Mitigations.js";
import {
  fetchRisksFromRI,
  isRiskIntellectConfigured,
  sanitizeRiSectorParam,
  type RiRiskExportDto,
} from "./riskIntellect/riskIntellectClient.js";
import { firstSectorLabel, vtsSectorFromPayload } from "../utils/attestationSector.js";

export interface RiskMappingRow {
  risk_mapping_id: number;
  risk_id: string | null;
  risk_title: string | null;
  domains: string | null;
  description: string | null;
  technical_description: string | null;
  executive_summary: string | null;
  attack_vector: string | null;
  observable_indicators: string | null;
  data_to_identify_risk: string | null;
  evidence_sources: string | null;
  intent: string | null;
  timing: string | null;
  risk_type_detected: string | null;
  primary_risk: string | null;
  secondary_risks: string | null;
  /** Copied from AI Risk Intellect when the API key is set. */
  likelihood?: number | null;
  impact?: number | null;
  severity?: number | null;
}

export interface MitigationRow {
  mapping_id: number;
  risk_id: string;
  mitigation_action_id: string;
  mitigation_action_name: string;
  mitigation_category: string;
  mitigation_definition: string | null;
}

/** Intent profile derived for type 2/3 scoring (same bands as VTS intent multiplier). */
export interface RiIntentScore {
  intentionalCount: number;
  unintentionalCount: number;
  profile: "Intentional" | "Unintentional" | "Mixed";
  /** Multiplier applied in SRS/IRS: Intentional 1.2, Unintentional 0.7, Mixed 1.0 */
  value: number;
  source: "risk_intellect" | "local_db" | "default";
  /** Human-readable contextual multipliers line */
  label: string;
}

export interface Top5RisksWithMitigations {
  top5Risks: RiskMappingRow[];
  mitigationsByRiskId: Record<string, MitigationRow[]>;
  /** Risks always come from the local AI-Q risk_mappings catalog. */
  source?: "local_db";
  /** Applicable scoring domains aggregated from AIRI risk records. */
  applicableDomains?: RiApplicableDomain[];
  applicableDomainsSource?: "risk_intellect";
  /**
   * Extra: when Controls AI Risk API key is set, intent is calculated from
   * AI Risk Intellect (matched to local top risks) and used in type 2/3 scores.
   */
  intentScore?: RiIntentScore;
  /**
   * Likelihood / impact / severity (1–5 / 1–5 / 1–25) from Risk Intellect.
   * Used by VTS product-risk (L × I). Fallback is hardcoded 3/3 when RI has no scores.
   */
  liSeverityScore?: RiLiSeverityScore;
}

export interface RiApplicableDomain {
  domain: string;
  riskCount: number;
}

/** Per-risk L/I/S arrays from Risk Intellect for VTS formula input. */
export interface RiLiSeverityScore {
  likelihoodScores: number[];
  impactScores: number[];
  severityScores: number[];
  likelihood: number;
  impact: number;
  severity: number;
  source: "risk_intellect" | "default";
  riskCount: number;
  label: string;
}

const DEFAULT_LIKELIHOOD_SCORES = [3, 3, 3];
const DEFAULT_IMPACT_SCORES = [3, 3, 3];
const DEFAULT_SEVERITY_SCORES = [9, 9, 9];

/** Build the risk-count-weighted domain input expected by the VTS formula. */
export function buildApplicableDomainsFromRiRisks(
  risks: RiRiskExportDto[],
): RiApplicableDomain[] {
  const byDomain = new Map<string, RiApplicableDomain>();
  for (const risk of risks) {
    const domain = String(risk.domain ?? "").trim();
    if (!domain) continue;
    const key = domain.toLowerCase();
    const current = byDomain.get(key);
    if (current) {
      current.riskCount += 1;
    } else {
      byDomain.set(key, { domain, riskCount: 1 });
    }
  }
  return [...byDomain.values()];
}

function toStr(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.length ? v.map(toStr).join(" ") : "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).trim();
}

/**
 * Canonical intent vocabulary.
 *
 * Risk Intellect emits Malicious | Accidental | Systemic | Unknown; the local
 * risk_mappings table stores Intentional / Unintentional. Both feed the same
 * intent multiplier, so both have to resolve here — matching only on the
 * "intentional" substring silently classified every RI value as null, which
 * dropped RI intent entirely and fell back to local-DB intent.
 *
 * Unknown stays unclassified: it is excluded from the multiplier rather than
 * counted as either side.
 */
const RI_INTENT_TOKENS: Record<string, "intentional" | "unintentional"> = {
  malicious: "intentional",
  intentional: "intentional",
  deliberate: "intentional",
  accidental: "unintentional",
  systemic: "unintentional",
  unintentional: "unintentional",
};

export function classifyIntentToken(
  raw: string | null | undefined,
): "intentional" | "unintentional" | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s || s === "unknown") return null;
  if (RI_INTENT_TOKENS[s]) return RI_INTENT_TOKENS[s];
  // Free-text values from either source: check the compound token first, since
  // "unintentional" contains "intentional".
  if (s.includes("unintentional")) return "unintentional";
  if (s.includes("intentional")) return "intentional";
  for (const [token, kind] of Object.entries(RI_INTENT_TOKENS)) {
    if (s.includes(token)) return kind;
  }
  return null;
}

/**
 * Same bands as Python/VTS calc_intent_multiplier:
 * >60% intentional → 1.2, >60% unintentional → 0.7, else Mixed 1.0.
 */
export function computeIntentScore(
  intents: Array<string | null | undefined>,
  source: RiIntentScore["source"],
): RiIntentScore {
  let intentionalCount = 0;
  let unintentionalCount = 0;
  for (const raw of intents) {
    const kind = classifyIntentToken(raw);
    if (kind === "intentional") intentionalCount += 1;
    else if (kind === "unintentional") unintentionalCount += 1;
  }
  const total = intentionalCount + unintentionalCount;
  if (total === 0) {
    return {
      intentionalCount: 0,
      unintentionalCount: 0,
      profile: "Mixed",
      value: 1.0,
      source: source === "risk_intellect" ? "risk_intellect" : "default",
      label: "Intent: Mixed (1.0)",
    };
  }
  const intentionalPct = intentionalCount / total;
  const unintentionalPct = unintentionalCount / total;
  let profile: RiIntentScore["profile"] = "Mixed";
  let value = 1.0;
  if (intentionalPct > 0.6) {
    profile = "Intentional";
    value = 1.2;
  } else if (unintentionalPct > 0.6) {
    profile = "Unintentional";
    value = 0.7;
  }
  return {
    intentionalCount,
    unintentionalCount,
    profile,
    value,
    source,
    label: `Intent: ${profile} (${value})`,
  };
}

function averageOr(scores: number[], fallback: number): number {
  if (scores.length === 0) return fallback;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

type LiSeverityFields = {
  likelihood?: number | null;
  impact?: number | null;
  severity?: number | null;
};

/**
 * Average 1–5 likelihood/impact (and 1–25 severity) from Risk Intellect rows.
 * Falls back to the previous hardcoded VTS stubs ([3,3,3] / L×I=9) when RI has no scores.
 */
export function computeLiSeverityScore(
  rows: LiSeverityFields[],
  source: RiLiSeverityScore["source"],
): RiLiSeverityScore {
  const likelihoodScores: number[] = [];
  const impactScores: number[] = [];
  const severityScores: number[] = [];
  for (const row of rows) {
    if (row.likelihood != null && Number.isFinite(row.likelihood)) {
      likelihoodScores.push(row.likelihood);
    }
    if (row.impact != null && Number.isFinite(row.impact)) {
      impactScores.push(row.impact);
    }
    const derived =
      row.severity != null && Number.isFinite(row.severity)
        ? row.severity
        : row.likelihood != null && row.impact != null
          ? row.likelihood * row.impact
          : null;
    if (derived != null) severityScores.push(derived);
  }
  const hasRiScores = likelihoodScores.length > 0 || impactScores.length > 0;
  const L = likelihoodScores.length > 0 ? likelihoodScores : [...DEFAULT_LIKELIHOOD_SCORES];
  const I = impactScores.length > 0 ? impactScores : [...DEFAULT_IMPACT_SCORES];
  const S =
    severityScores.length > 0 ? severityScores : [...DEFAULT_SEVERITY_SCORES];
  const likelihood = averageOr(L, 3);
  const impact = averageOr(I, 3);
  const severity = averageOr(S, 9);
  const resolvedSource: RiLiSeverityScore["source"] = hasRiScores
    ? "risk_intellect"
    : "default";
  const labelSource = source === "risk_intellect" && hasRiScores ? "risk_intellect" : resolvedSource;
  return {
    likelihoodScores: L,
    impactScores: I,
    severityScores: S,
    likelihood,
    impact,
    severity,
    source: labelSource,
    riskCount: Math.max(L.length, I.length, S.length),
    label: `L=${likelihood.toFixed(2)} I=${impact.toFixed(2)} S=${severity.toFixed(2)} (${labelSource})`,
  };
}

/**
 * Injects RI-derived intent fields into an assessment payload for type 2/3 scoring.
 */
export function applyIntentScoreToPayload(
  payload: Record<string, unknown>,
  intentScore: RiIntentScore | undefined,
): Record<string, unknown> {
  if (!intentScore) return payload;
  return {
    ...payload,
    intentionalRiskCount: intentScore.intentionalCount,
    unintentionalRiskCount: intentScore.unintentionalCount,
    intent_multiplier_value: intentScore.value,
    intentMultiplierValue: intentScore.value,
    intent_profile: intentScore.profile,
    intentProfile: intentScore.profile,
    contextual_multipliers: intentScore.label,
    contextualMultipliers: intentScore.label,
  };
}

/**
 * Injects RI likelihood / impact / severity arrays used by VTS product-risk (L × I).
 */
export function applyLiSeverityScoreToPayload(
  payload: Record<string, unknown>,
  li: RiLiSeverityScore | undefined,
): Record<string, unknown> {
  if (!li || li.source !== "risk_intellect") return payload;
  return {
    ...payload,
    likelihoodScores: li.likelihoodScores,
    impactScores: li.impactScores,
    severityScores: li.severityScores,
    likelihood_score_source: li.source,
    impact_score_source: li.source,
    severity_score_source: li.source,
    likelihood_score_value: li.likelihood,
    impact_score_value: li.impact,
    severity_score_value: li.severity,
  };
}

/** Inject AIRI-derived applicable domains used by the VTS domain weighting. */
export function applyApplicableDomainsToPayload(
  payload: Record<string, unknown>,
  domains: RiApplicableDomain[] | undefined,
  source: Top5RisksWithMitigations["applicableDomainsSource"],
): Record<string, unknown> {
  if (source !== "risk_intellect" || !domains?.length) return payload;
  return {
    ...payload,
    applicableDomains: domains,
    applicable_domains_source: source,
    applicableDomainsSource: source,
  };
}

/**
 * Apply all Risk Intellect enrichments (intent + L/I/S + domains) to a scoring payload.
 */
export function applyRiEnrichmentToPayload(
  payload: Record<string, unknown>,
  top5: Top5RisksWithMitigations | null | undefined,
): Record<string, unknown> {
  if (!top5) return payload;
  return applyApplicableDomainsToPayload(
    applyLiSeverityScoreToPayload(
      applyIntentScoreToPayload(payload, top5.intentScore),
      top5.liSeverityScore,
    ),
    top5.applicableDomains,
    top5.applicableDomainsSource,
  );
}

/**
 * Risk Intellect `sector` query expects a short name (Healthcare, Technology).
 * Type-01 VTS stores sector as `{ private_sector: [...], public_sector: [...] }`.
 * JSON-stringifying that and sending it as `?sector={...}` returns zero risks.
 */
function firstPlainSector(raw: unknown): string | undefined {
  const label = firstSectorLabel(raw);
  return sanitizeRiSectorParam(label) ?? (label.trim() || undefined);
}

function extractRiSector(payload: Record<string, unknown>): string | undefined {
  const cp =
    payload.companyProfile && typeof payload.companyProfile === "object" && !Array.isArray(payload.companyProfile)
      ? (payload.companyProfile as Record<string, unknown>)
      : {};
  const candidates: unknown[] = [
    payload.customer_sector,
    payload.customerSector,
    payload.industry_sector,
    payload.industrySector,
    payload.industry,
    payload.sector,
    cp.sector,
    payload.target_industries,
  ];
  for (const raw of candidates) {
    const found = firstPlainSector(raw);
    if (found) return found;
  }
  return undefined;
}

function isType01AttestationPayload(payload: Record<string, unknown>): boolean {
  return Boolean(
    payload.decision_autonomy ??
      payload.ai_autonomy_level ??
      payload.pii_handling ??
      payload.pii_information ??
      payload.product_stage ??
      payload.stage_product ??
      payload.documented_ai_governance_policy,
  );
}

/**
 * Extract assessment context for matching risk_mappings table on domain, timing, intent, primary_risk, secondary_risks.
 * Type 01 uses attestation answers; types 2/3 keep buyer/vendor COTS fields.
 */
function extractContext(payload: Record<string, unknown>): {
  domain: string;
  intent: string;
  timing: string;
  primary_risk: string;
  secondary_risks: string;
} {
  const cp =
    payload.companyProfile && typeof payload.companyProfile === "object" && !Array.isArray(payload.companyProfile)
      ? (payload.companyProfile as Record<string, unknown>)
      : {};

  if (isType01AttestationPayload(payload)) {
    const sectorLabel =
      firstSectorLabel(payload.sector ?? cp.sector ?? payload.target_industries) ||
      vtsSectorFromPayload(payload);
    const domain = [
      sectorLabel,
      toStr(payload.pii_handling ?? payload.pii_information),
      "Privacy",
      "AI System Safety",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
    const intent = toStr(payload.decision_autonomy ?? payload.ai_autonomy_level);
    const timing = toStr(payload.product_stage ?? payload.stage_product);
    const primary_risk =
      toStr(payload.pii_handling ?? payload.pii_information) ||
      toStr(payload.pain_points_solved ?? payload.pain_points).slice(0, 200);
    const secondary_risks = [
      toStr(payload.adversarial_security_testing ?? payload.security_testing),
      toStr(payload.incident_response_plan),
      toStr(payload.human_oversight),
      toStr(payload.bias_testing_approach ?? payload.bias_ai),
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200);
    return { domain, intent, timing, primary_risk, secondary_risks };
  }

  const domain =
    toStr(payload.customer_sector ?? payload.customerSector) ||
    toStr(payload.industry_sector ?? payload.industrySector ?? payload.industry) ||
    toStr(payload.sector ?? cp.sector) ||
    toStr(payload.risk_domain_scores ?? payload.riskDomainScores).slice(0, 200);
  const intent =
    toStr(payload.expected_outcomes ?? payload.expectedOutcomes) ||
    toStr(payload.business_pain_point ?? payload.businessPainPoint) ||
    toStr(payload.regulatory_requirements ?? payload.regulatoryRequirements).slice(0, 200);
  const timing =
    toStr(payload.implementation_timeline ?? payload.implementationTimeline) ||
    toStr(payload.target_timeline ?? payload.targetTimeline);
  const primary_risk =
    toStr(payload.primary_pain_point ?? payload.primaryPainPoint) ||
    toStr(payload.business_pain_point ?? payload.businessPainPoint) ||
    toStr(payload.identified_risks ?? payload.identifiedRisks).slice(0, 200) ||
    toStr(payload.customer_specific_risks ?? payload.customerSpecificRisks).slice(0, 200);
  const secondary_risks =
    toStr(payload.identified_risks ?? payload.identifiedRisks).slice(0, 200) ||
    toStr(payload.customer_specific_risks ?? payload.customerSpecificRisks).slice(0, 200) ||
    "";
  return { domain, intent, timing, primary_risk, secondary_risks };
}

function extractMappingIds(payload: Record<string, unknown>): number[] {
  const raw = payload.risk_mitigation_mapping_ids ?? payload.riskMitigationMappingIds;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const ids = list
    .map((v) => Number(String(v).trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

/**
 * After local top-5 risks are selected, call AI Risk Intellect (when API key is set)
 * to resolve domains, Intentional/Unintentional intent, and likelihood / impact /
 * severity for those risks. Domains and L/I/S are used by VTS product risk.
 */
async function enrichIntentFromRiskIntellect(
  top5: Top5RisksWithMitigations,
  sector: string,
): Promise<Top5RisksWithMitigations> {
  const defaultLi = computeLiSeverityScore([], "default");
  const localFallback = (): Top5RisksWithMitigations => ({
    ...top5,
    intentScore: computeIntentScore(
      top5.top5Risks.map((r) => r.intent),
      top5.top5Risks.some((r) => classifyIntentToken(r.intent)) ? "local_db" : "default",
    ),
    liSeverityScore: defaultLi,
  });

  if (!isRiskIntellectConfigured()) {
    console.log(
      "[type-01 VTS] likelihood/impact STATIC fallback [3,3,3] — AI Risk API key or AI_RISK_INTELLECT_BASE_URL not set",
      {
        formula: "L = avg([3,3,3]) = 3, I = avg([3,3,3]) = 3",
        source: "default",
        likelihoodScores: DEFAULT_LIKELIHOOD_SCORES,
        impactScores: DEFAULT_IMPACT_SCORES,
      },
    );
    return localFallback();
  }

  try {
    const riSector = sanitizeRiSectorParam(sector);
    const riResult = await fetchRisksFromRI({
      limit: 50,
      sector: riSector,
    });
    if (!riResult || riResult.risks.length === 0) {
      console.log(
        "[type-01 VTS] likelihood/impact STATIC fallback [3,3,3] — AI Risk Intellect returned no sector-matched risks",
        {
          requestedSector: riSector ?? null,
          fetchReturned: riResult
            ? riResult.clientFiltered
              ? "empty-after-client-filter"
              : "empty-list"
            : "null (timeout/http/parse — see [RI] fetch failed)",
        },
      );
      return localFallback();
    }

    const byCatalogId = new Map<string, RiRiskExportDto>();
    for (const ri of riResult.risks) {
      const keys = [
        ...(ri.catalogMatchIds ?? []),
        ri.catalogMatchId ?? "",
      ]
        .map((k) => k.trim())
        .filter(Boolean);
      for (const key of keys) {
        if (!byCatalogId.has(key)) byCatalogId.set(key, ri);
      }
    }

    let matchedWithRiIntent = 0;
    let matchedWithRiScores = 0;
    const matchedRiRisks = new Set<RiRiskExportDto>();
    for (const row of top5.top5Risks) {
      const rid = (row.risk_id ?? "").trim();
      if (!rid) continue;
      const match = byCatalogId.get(rid);
      if (!match) continue;
      matchedRiRisks.add(match);
      if (match.intent) {
        row.intent = match.intent;
        matchedWithRiIntent += 1;
      }
      if (match.likelihood != null || match.impact != null || match.severity != null) {
        row.likelihood = match.likelihood;
        row.impact = match.impact;
        row.severity = match.severity;
        matchedWithRiScores += 1;
      }
    }

    const matchedIntents = top5.top5Risks.map((r) => r.intent);
    const riIntents = riResult.risks.map((r) => r.intent);
    const intentsForScore =
      matchedWithRiIntent > 0
        ? matchedIntents
        : riIntents.some((i) => classifyIntentToken(i))
          ? riIntents
          : matchedIntents;

    const source: RiIntentScore["source"] =
      matchedWithRiIntent > 0 || riIntents.some((i) => classifyIntentToken(i))
        ? "risk_intellect"
        : top5.top5Risks.some((r) => classifyIntentToken(r.intent))
          ? "local_db"
          : "default";

    const matchedScoreRows = top5.top5Risks.filter(
      (r) => r.likelihood != null || r.impact != null || r.severity != null,
    );
    const scoreRows: LiSeverityFields[] =
      matchedWithRiScores > 0 ? matchedScoreRows : riResult.risks;
    const liSeverityScore = computeLiSeverityScore(
      scoreRows,
      matchedWithRiScores > 0 ||
        riResult.risks.some((r) => r.likelihood != null || r.impact != null)
        ? "risk_intellect"
        : "default",
    );
    const matchedDomainRows = [...matchedRiRisks].filter((risk) =>
      Boolean(risk.domain.trim()),
    );
    const applicableDomains = buildApplicableDomainsFromRiRisks(
      matchedDomainRows.length > 0 ? matchedDomainRows : riResult.risks,
    );

    console.log("[type-01 VTS] likelihood/impact from AI Risk Intellect", {
      formula: "L = avg(likelihoodScores 1–5), I = avg(impactScores 1–5), S = avg(severity or L×I)",
      riConfigured: true,
      matchedWithRiScores,
      perRisk: top5.top5Risks.map((r) => ({
        risk_id: r.risk_id,
        likelihood: r.likelihood ?? null,
        impact: r.impact ?? null,
        severity: r.severity ?? null,
      })),
      likelihoodScores: liSeverityScore.likelihoodScores,
      impactScores: liSeverityScore.impactScores,
      severityScores: liSeverityScore.severityScores,
      calculation: {
        L: `${liSeverityScore.likelihoodScores.join(" + ")} / ${liSeverityScore.likelihoodScores.length} = ${liSeverityScore.likelihood}`,
        I: `${liSeverityScore.impactScores.join(" + ")} / ${liSeverityScore.impactScores.length} = ${liSeverityScore.impact}`,
        S: `${liSeverityScore.severity.toFixed(4)}`,
      },
      source: liSeverityScore.source,
      label: liSeverityScore.label,
      applicableDomains,
    });

    return {
      ...top5,
      intentScore: computeIntentScore(intentsForScore, source),
      liSeverityScore,
      ...(applicableDomains.length > 0
        ? {
            applicableDomains,
            applicableDomainsSource: "risk_intellect" as const,
          }
        : {}),
    };
  } catch (err) {
    console.error("enrichIntentFromRiskIntellect failed; using local/default intent:", err);
    return localFallback();
  }
}

/**
 * Human-readable block for LLM prompts (same shape as vendor COTS "Database-matched top risks").
 */
export function formatTop5RisksForPrompt(top5: Top5RisksWithMitigations | null): string {
  if (!top5 || top5.top5Risks.length === 0) return "";
  const lines: string[] = ["--- Database-matched top risks and mitigations ---"];
  if (top5.intentScore) {
    lines.push(
      `Intent score (${top5.intentScore.source}): ${top5.intentScore.label} ` +
        `[intentional=${top5.intentScore.intentionalCount}, unintentional=${top5.intentScore.unintentionalCount}]`,
    );
  }
  if (top5.liSeverityScore) {
    lines.push(
      `Likelihood/impact/severity (${top5.liSeverityScore.source}): ${top5.liSeverityScore.label}`,
    );
  }
  for (const r of top5.top5Risks) {
    const liBits = [
      r.likelihood != null ? `Likelihood: ${r.likelihood}` : null,
      r.impact != null ? `Impact: ${r.impact}` : null,
      r.severity != null ? `Severity: ${r.severity}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    lines.push(
      `Risk [${r.risk_id}]: ${r.risk_title ?? "N/A"} | Domain: ${r.domains ?? "N/A"} | Intent: ${r.intent ?? "N/A"} | Timing: ${r.timing ?? "N/A"} | Primary risk: ${r.primary_risk ?? "N/A"}` +
        (liBits ? ` | ${liBits}` : ""),
    );
    if (r.description) {
      lines.push(`  Description: ${r.description.slice(0, 300)}${r.description.length > 300 ? "..." : ""}`);
    }
    if (r.attack_vector) {
      lines.push(`  Attack vector: ${r.attack_vector}`);
    }
    if (r.evidence_sources) {
      lines.push(`  Evidence: ${r.evidence_sources}`);
    }
    const mitigations = r.risk_id ? top5.mitigationsByRiskId[r.risk_id] ?? [] : [];
    for (const m of mitigations) {
      lines.push(
        `  Mitigation: ${m.mitigation_action_name} (${m.mitigation_category})${m.mitigation_definition ? ` – ${m.mitigation_definition.slice(0, 150)}` : ""}`,
      );
    }
  }
  lines.push("--- End of database-matched risks ---");
  return lines.join("\n");
}

/**
 * 1. Fetch top risks from the AI-Q local risk_mappings DB (primary).
 * 2. Extra: when AI Risk Intellect API key is set, calculate domains, intent,
 *    and likelihood / impact / severity from RI for those risks.
 * 3. Intent is used for type 2/3; domains and L/I/S are used for type 1 VTS.
 */
export async function getTop5RisksWithMitigations(
  payload: Record<string, unknown>,
): Promise<Top5RisksWithMitigations> {
  const { domain, intent, timing, primary_risk, secondary_risks } = extractContext(payload);
  const explicitMappingIds = extractMappingIds(payload);

  const domainPattern = domain ? `%${domain}%` : null;
  const intentPattern = intent ? `%${intent}%` : null;
  const timingPattern = timing ? `%${timing}%` : null;
  const primaryRiskPattern = primary_risk ? `%${primary_risk}%` : null;
  const secondaryRisksPattern = secondary_risks ? `%${secondary_risks}%` : null;

  type QueryResult = { rows: RiskMappingRow[] };
  const selectedRows: RiskMappingRow[] = [];
  if (explicitMappingIds.length > 0) {
    const explicitTop5Result = await db.execute(sql`
      SELECT risk_mapping_id, risk_id, risk_title, domains, description, technical_description,
             executive_summary, attack_vector, observable_indicators, data_to_identify_risk,
             evidence_sources, intent, timing, risk_type_detected, primary_risk, secondary_risks
      FROM public.risk_mappings
      WHERE risk_mapping_id IN (${sql.join(explicitMappingIds.map((id) => sql`${id}`), sql`, `)})
      ORDER BY risk_mapping_id ASC
      LIMIT 5
    `);
    selectedRows.push(...((((explicitTop5Result as unknown) as QueryResult).rows ?? []) as RiskMappingRow[]));
  }

  const remaining = Math.max(0, 5 - selectedRows.length);
  const excludeIds = selectedRows.map((r) => r.risk_mapping_id).filter((n) => Number.isInteger(n));
  const fallbackResult =
    remaining > 0
      ? await db.execute(sql`
          WITH scored AS (
            SELECT *,
              (CASE WHEN ${domainPattern}::text IS NOT NULL AND domains IS NOT NULL AND domains ILIKE ${domainPattern} THEN 1 ELSE 0 END +
               CASE WHEN ${intentPattern}::text IS NOT NULL AND intent IS NOT NULL AND intent ILIKE ${intentPattern} THEN 1 ELSE 0 END +
               CASE WHEN ${timingPattern}::text IS NOT NULL AND timing IS NOT NULL AND timing ILIKE ${timingPattern} THEN 1 ELSE 0 END +
               CASE WHEN ${primaryRiskPattern}::text IS NOT NULL AND primary_risk IS NOT NULL AND primary_risk ILIKE ${primaryRiskPattern} THEN 1 ELSE 0 END +
               CASE WHEN ${secondaryRisksPattern}::text IS NOT NULL AND secondary_risks IS NOT NULL AND secondary_risks ILIKE ${secondaryRisksPattern} THEN 1 ELSE 0 END) AS match_score
            FROM public.risk_mappings
          )
          SELECT risk_mapping_id, risk_id, risk_title, domains, description, technical_description,
                 executive_summary, attack_vector, observable_indicators, data_to_identify_risk,
                 evidence_sources, intent, timing, risk_type_detected, primary_risk, secondary_risks
          FROM scored
          ${excludeIds.length > 0 ? sql`WHERE risk_mapping_id NOT IN (${sql.join(excludeIds.map((id) => sql`${id}`), sql`, `)})` : sql``}
          ORDER BY match_score DESC NULLS LAST, risk_mapping_id ASC
          LIMIT ${remaining}
        `)
      : null;
  const fallbackRows: RiskMappingRow[] = fallbackResult
    ? (((fallbackResult as unknown) as QueryResult).rows ?? [])
    : [];
  const rows: RiskMappingRow[] = [...selectedRows, ...fallbackRows].slice(0, 5);

  const riskIds = [...new Set(rows.map((r) => r.risk_id).filter(Boolean) as string[])];

  let mitigationsByRiskId: Record<string, MitigationRow[]> = {};
  if (riskIds.length > 0) {
    const mitigationsRows = await db
      .select()
      .from(riskTop5Mitigations)
      .where(inArray(riskTop5Mitigations.risk_id, riskIds));
    const mitigations: MitigationRow[] = mitigationsRows.map((m) => ({
      mapping_id: m.mapping_id,
      risk_id: m.risk_id,
      mitigation_action_id: m.mitigation_action_id,
      mitigation_action_name: m.mitigation_action_name,
      mitigation_category: m.mitigation_category,
      mitigation_definition: m.mitigation_definition ?? null,
    }));
    mitigationsByRiskId = riskIds.reduce<Record<string, MitigationRow[]>>((acc, id) => {
      acc[id] = mitigations.filter((m) => m.risk_id === id);
      return acc;
    }, {});
  }

  const fromLocal: Top5RisksWithMitigations = {
    top5Risks: rows,
    mitigationsByRiskId,
    source: "local_db",
  };

  return enrichIntentFromRiskIntellect(fromLocal, extractRiSector(payload) ?? "");
}