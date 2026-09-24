/**
 * HTTP client for Python scoring services.
 * Type 1 (VTS): /assessment/score — LLM + formula
 * Type 2 (SRS): /assessment/cots-vendor/score — sales-risk formula
 * Type 3 (IRS): /assessment/cots-buyer/score — buyer implementation-risk formula
 * Env: PYTHON_SCORING_URL (default http://localhost:5004)
 */

import { resolveActorSnapshot } from "./observability/llmUsage.service.js";
import { getRequestActor } from "../utils/requestActorContext.js";
import {
  assertFeatureTokenQuota,
  throwIfTokenQuotaHttpError,
} from "./admin/featureTokenQuota.service.js";
import { maybeNotifyTokenQuotaExhausted } from "./admin/tokenQuotaAlert.service.js";

export interface PythonScoreResult {
  vendor_trust_score: number;
  product_risk: number;
  governance_risk: number;
  operational_risk: number;
  weighted_risk: number;
  grade: string;
  classification: string;
  recommended_action: string;
  detail: Record<string, unknown>;
  scoring_version: string;
  scoring_source?: string;
  formula_vendor_trust_score?: number;
  trust_score?: {
    overallScore?: number;
    label?: string;
    summary?: string;
    grade?: string;
    scoreByCategory?: Record<string, string | number>;
  };
  sections?: Array<{
    id: number;
    title: string;
    subtitle?: string;
    items: Record<string, string>;
  }>;
  raw?: string;
  /** Full VTS RATIONALE block from Python (same as terminal). */
  rationale?: string;
}

/** Type 2 — Sales Risk Score (Python formula). */
export interface PythonCotsVendorScoreResult {
  sales_risk_score: number;
  deal_probability_pct: number;
  customer_friction_risk: number;
  implementation_risk: number;
  competitive_risk: number;
  grade: string;
  classification: string;
  deal_characteristics: string;
  recommended_actions: string;
  detail: Record<string, unknown>;
  scoring_source?: string;
  scoring_version?: string;
  /** Plain-text rationale for terminal display (same as Python console). */
  rationale?: string;
  /** Step-by-step SRS math + hardcoded constants (Python console dump). */
  formula_console?: string;
}

/** Type 3 — Buyer Implementation Risk Score (Python formula). */
export interface PythonCotsBuyerScoreResult {
  implementationRiskScore: number;
  grade: string;
  classification: string;
  decision: string;
  readiness_profile?: string;
  recommendedAction: string;
  formula: string;
  breakdown: {
    vendorRisk: number;
    organizationalReadinessGap: number;
    integrationRisk: number;
    vendorTrustScore: number;
    intentMultiplier?: number;
    intentProfile?: string;
  };
  source: {
    vendorName: string;
    productName: string;
    usedAttestation: boolean;
  };
  detail?: Record<string, unknown>;
  scoring_source?: string;
  scoring_version?: string;
  /** Plain-text rationale for terminal display (same as Python console). */
  rationale?: string;
  /** Step-by-step IRS math + hardcoded constants (Python console dump). */
  formula_console?: string;
}

function scoringBaseUrl(): string {
  const raw = (process.env.PYTHON_SCORING_URL ?? "http://localhost:5004").trim();
  return raw.replace(/\/+$/, "");
}

/**
 * VTS `/assessment/score` runs Bedrock LLM then returns (with formula fallback on LLM error).
 * 12s was too short — Node aborted before Python could respond, so submit saved COMPLETED
 * with no trust score and Product Profile showed "—".
 */
const DEFAULT_TIMEOUT_MS = 320_000;

async function postJson(
  url: string,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut =
      (err instanceof Error && err.name === "AbortError") ||
      /aborted|timeout/i.test(msg);
    throw new Error(
      timedOut
        ? `Python scoring service timed out at ${url} after ${timeoutMs}ms`
        : `Python scoring service unreachable at ${url}: ${msg}`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throwIfTokenQuotaHttpError(response.status, parsed, "attestation");
    const detail =
      parsed && typeof parsed === "object" && parsed !== null && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : text.slice(0, 500);
    throw new Error(`Python scoring failed (${response.status}): ${detail || response.statusText}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Python scoring returned empty or invalid JSON");
  }
  return parsed as Record<string, unknown>;
}

export async function scoreVendorAttestationWithPython(
  payload: Record<string, unknown>,
  vendorData?: string,
): Promise<PythonScoreResult> {
  await assertFeatureTokenQuota("attestation");
  const url = `${scoringBaseUrl()}/assessment/score`;
  const actor = await resolveActorSnapshot(getRequestActor().userId ?? null);
  const r = await postJson(url, {
    payload,
    vendor_data: typeof vendorData === "string" && vendorData.trim() ? vendorData : undefined,
    actor_user_id: actor.userId,
    actor_user_name: actor.userName,
    actor_organization_id: actor.organizationId,
    actor_organization_name: actor.organizationName,
    usage_feature: "attestation",
  });

  const vendorTrustScore = Number(r.vendor_trust_score);
  if (!Number.isFinite(vendorTrustScore))
    throw new Error("Python scoring response missing vendor_trust_score");

  const trustScore =
    r.trust_score && typeof r.trust_score === "object" && !Array.isArray(r.trust_score)
      ? (r.trust_score as PythonScoreResult["trust_score"])
      : undefined;
  const sections = Array.isArray(r.sections)
    ? (r.sections as NonNullable<PythonScoreResult["sections"]>)
    : undefined;

  const result: PythonScoreResult = {
    vendor_trust_score: vendorTrustScore,
    product_risk: Number(r.product_risk ?? 0),
    governance_risk: Number(r.governance_risk ?? 0),
    operational_risk: Number(r.operational_risk ?? 0),
    weighted_risk: Number(r.weighted_risk ?? 0),
    grade: String(r.grade ?? ""),
    classification: String(r.classification ?? ""),
    recommended_action: String(r.recommended_action ?? ""),
    detail:
      r.detail && typeof r.detail === "object" && !Array.isArray(r.detail)
        ? (r.detail as Record<string, unknown>)
        : {},
    scoring_version: String(r.scoring_version ?? "vts-llm-1.0"),
    scoring_source: r.scoring_source != null ? String(r.scoring_source) : "llm",
    formula_vendor_trust_score:
      r.formula_vendor_trust_score != null && Number.isFinite(Number(r.formula_vendor_trust_score))
        ? Number(r.formula_vendor_trust_score)
        : undefined,
    trust_score: trustScore,
    sections,
    raw: typeof r.raw === "string" ? r.raw : undefined,
    rationale: typeof r.rationale === "string" ? r.rationale : undefined,
  };

  if (actor.userId != null && actor.organizationId != null) {
    await maybeNotifyTokenQuotaExhausted({
      userId: actor.userId,
      organizationId: actor.organizationId,
      userName: actor.userName,
      organizationName: actor.organizationName,
      feature: "attestation",
    });
  }

  return result;
}

/** Type 2 — Sales Risk Score formula in Python (Node persists only). */
export async function scoreCotsVendorWithPython(
  payload: Record<string, unknown>,
): Promise<PythonCotsVendorScoreResult> {
  const url = `${scoringBaseUrl()}/assessment/cots-vendor/score`;
  const r = await postJson(url, { payload });

  const salesRiskScore = Number(r.sales_risk_score);
  if (!Number.isFinite(salesRiskScore)) {
    throw new Error("Python cots-vendor scoring response missing sales_risk_score");
  }

  return {
    sales_risk_score: salesRiskScore,
    deal_probability_pct: Number(r.deal_probability_pct ?? 0),
    customer_friction_risk: Number(r.customer_friction_risk ?? 0),
    implementation_risk: Number(r.implementation_risk ?? 0),
    competitive_risk: Number(r.competitive_risk ?? 0),
    grade: String(r.grade ?? ""),
    classification: String(r.classification ?? ""),
    deal_characteristics: String(r.deal_characteristics ?? ""),
    recommended_actions: String(r.recommended_actions ?? ""),
    detail:
      r.detail && typeof r.detail === "object" && !Array.isArray(r.detail)
        ? (r.detail as Record<string, unknown>)
        : {},
    scoring_source: r.scoring_source != null ? String(r.scoring_source) : "formula",
    scoring_version: r.scoring_version != null ? String(r.scoring_version) : "srs-1.0",
    rationale: typeof r.rationale === "string" ? r.rationale : undefined,
  };
}

/** Type 3 — Buyer Implementation Risk Score formula in Python (Node persists only). */
export async function scoreCotsBuyerWithPython(options: {
  buyerPayload: Record<string, unknown>;
  attestationRow?: Record<string, unknown> | null;
  vendorName: string;
  productName: string;
  timeoutMs?: number;
}): Promise<PythonCotsBuyerScoreResult> {
  const url = `${scoringBaseUrl()}/assessment/cots-buyer/score`;
  const r = await postJson(
    url,
    {
      buyer_payload: options.buyerPayload,
      attestation_row: options.attestationRow ?? null,
      vendor_name: options.vendorName,
      product_name: options.productName,
    },
    options.timeoutMs,
  );

  const implementationRiskScore = Math.round(Number(r.implementationRiskScore));
  if (!Number.isFinite(implementationRiskScore)) {
    throw new Error("Python cots-buyer scoring response missing implementationRiskScore");
  }

  const breakdownRaw =
    r.breakdown && typeof r.breakdown === "object" && !Array.isArray(r.breakdown)
      ? (r.breakdown as Record<string, unknown>)
      : {};
  const sourceRaw =
    r.source && typeof r.source === "object" && !Array.isArray(r.source)
      ? (r.source as Record<string, unknown>)
      : {};
  const detailRaw =
    r.detail && typeof r.detail === "object" && !Array.isArray(r.detail)
      ? (r.detail as Record<string, unknown>)
      : undefined;

  const vendorRisk = Math.round(Number(breakdownRaw.vendorRisk ?? 0) * 100) / 100;
  const organizationalReadinessGap =
    Math.round(Number(breakdownRaw.organizationalReadinessGap ?? 0) * 100) / 100;
  const integrationRisk = Math.round(Number(breakdownRaw.integrationRisk ?? 0) * 100) / 100;
  const vendorTrustScore = Math.round(Number(breakdownRaw.vendorTrustScore ?? 0) * 100) / 100;
  const intentRaw = Number(breakdownRaw.intentMultiplier ?? 1);
  const intentMultiplier =
    Number.isFinite(intentRaw) && intentRaw > 0 ? Math.min(1.5, Math.max(0.5, intentRaw)) : 1;

  return {
    implementationRiskScore,
    grade: String(r.grade ?? ""),
    classification: String(r.classification ?? ""),
    decision: String(r.decision ?? ""),
    readiness_profile:
      r.readiness_profile != null ? String(r.readiness_profile) : undefined,
    recommendedAction: String(r.recommendedAction ?? ""),
    formula: String(r.formula ?? ""),
    breakdown: {
      vendorRisk,
      organizationalReadinessGap,
      integrationRisk,
      vendorTrustScore,
      intentMultiplier,
      intentProfile:
        breakdownRaw.intentProfile != null ? String(breakdownRaw.intentProfile) : undefined,
    },
    source: {
      vendorName: String(sourceRaw.vendorName ?? options.vendorName),
      productName: String(sourceRaw.productName ?? options.productName),
      usedAttestation: Boolean(sourceRaw.usedAttestation),
    },
    detail: detailRaw,
    scoring_source: r.scoring_source != null ? String(r.scoring_source) : "formula",
    scoring_version: r.scoring_version != null ? String(r.scoring_version) : "irs-1.1",
    rationale: typeof r.rationale === "string" ? r.rationale : undefined,
    formula_console: typeof r.formula_console === "string" ? r.formula_console : undefined,
  };
}
