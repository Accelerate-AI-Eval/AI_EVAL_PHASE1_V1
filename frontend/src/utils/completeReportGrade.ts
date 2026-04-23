/**
 * Letter grade from a risk-like score (0-100, higher = worse).
 * - `vendor`: mirrors backend `interpretSalesRiskScore` via dealProbability = 100 - risk.
 * - `buyer`: mirrors backend `buyerImplementationRiskScore` readiness grade via IRS = 100 - risk.
 */
export type CompleteReportLetterGrade = "A" | "B" | "C" | "D" | "F";
export type CompleteReportGradingProfile = "vendor" | "buyer";

/** Legacy stored values may use "E" for the lowest band; UI and new logic use "F" (A–D, then F). */
export function normalizeDisplayLetterGrade(g: string | null | undefined): string {
  const s = String(g ?? "").trim();
  if (s.toUpperCase() === "E") return "F";
  return s;
}

export function gradeFromOverallRiskScore(
  score: number,
  profile: CompleteReportGradingProfile = "vendor",
): CompleteReportLetterGrade {
  const s = Math.max(0, Math.min(100, Math.round(Number(score))));
  if (profile === "buyer") {
    const irs = Math.max(0, Math.min(100, Math.round(100 - s)));
    if (irs >= 76) return "A";
    if (irs >= 51) return "B";
    if (irs >= 26) return "C";
    return "D";
  }
  const dealProbability = Math.max(0, Math.min(100, Math.round(100 - s)));
  if (dealProbability >= 90) return "A";
  if (dealProbability >= 80) return "B";
  if (dealProbability >= 70) return "C";
  if (dealProbability >= 60) return "D";
  return "F";
}

/**
 * Reads overall risk score (0–100, higher = more risk) from stored customer risk report JSON.
 * Matches ReportDetail / generatedAnalysis.overallRiskScore.
 */
export function overallRiskScoreFromReportJson(report: unknown): number | null {
  if (report == null || typeof report !== "object") return null;
  const r = report as Record<string, unknown>;
  const gen = r.generatedAnalysis;
  if (gen == null || typeof gen !== "object") return null;
  const g = gen as Record<string, unknown>;
  const raw = g.overallRiskScore;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

/** Risk level label from stored report JSON (e.g. generatedAnalysis.riskLevel). */
export function riskLevelFromReportJson(report: unknown): string | null {
  if (report == null || typeof report !== "object") return null;
  const r = report as Record<string, unknown>;
  const gen = r.generatedAnalysis;
  if (gen == null || typeof gen !== "object") return null;
  const g = gen as Record<string, unknown>;
  const raw = g.riskLevel;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/**
 * Same headline as the complete report approval banner (ReportDetail).
 * overallRiskScore is 0–100 risk (higher = worse).
 */
export function customerRiskReportApprovalHeading(
  riskScore: number,
  riskLevel: string,
): string {
  const L = String(riskLevel ?? "")
    .trim()
    .toLowerCase();
  if (L.includes("high") || L.includes("critical") || L.includes("severe")) {
    return "Further Review Required";
  }
  if (L.includes("low") || L.includes("minimal")) {
    return "Recommended for Approval";
  }
  const s = Math.max(0, Math.min(100, Number(riskScore) || 0));
  if (s <= 33) return "Recommended for Approval";
  if (s >= 67) return "Further Review Required";
  return "Conditional Approval";
}

/** Readiness / alignment score shown on the complete report (100 − risk). */
export function alignmentScoreFromRiskScore(riskScore: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - riskScore)));
}

/** Card/list payload: alignment score for customer reports; IRS (0–100) for buyer vendor risk rows. */
export interface ReportContextScoreSource {
  report?: Record<string, unknown>;
  source?: "customer" | "buyer_vendor_risk";
  implementationRiskScore?: number | null;
  implementationRiskClassification?: string | null;
  implementationRiskDecision?: string | null;
}

/**
 * Score shown on complete-report cards (same basis as ReportDetail vendor context score for customer rows).
 * Buyer vendor risk rows use implementation risk score from the merged assessment report.
 */
export function reportContextScoreFromListPayload(
  row: ReportContextScoreSource,
): number | null {
  if (row.source === "buyer_vendor_risk") {
    const irs = row.implementationRiskScore;
    if (irs != null && Number.isFinite(Number(irs)))
      return Math.round(Math.max(0, Math.min(100, Number(irs))));
    return null;
  }
  const risk = overallRiskScoreFromReportJson(row.report);
  return risk != null ? alignmentScoreFromRiskScore(risk) : null;
}

/**
 * Implementation risk score (0–100, higher worse) from list row or embedded report JSON
 * (same fields as buyer dashboard / merged assessment).
 */
export function implementationRiskScoreFromReportPayload(
  row: ReportContextScoreSource,
): number | null {
  const top = row.implementationRiskScore;
  if (top != null && Number.isFinite(Number(top))) {
    return Math.round(Math.max(0, Math.min(100, Number(top))));
  }
  const rep = row.report;
  if (rep == null || typeof rep !== "object") return null;
  const r = rep as Record<string, unknown>;
  const direct = Number(
    r.implementationRiskScore ?? r.implementation_risk_score,
  );
  if (Number.isFinite(direct))
    return Math.round(Math.max(0, Math.min(100, direct)));
  const gen = r.generatedAnalysis;
  if (gen != null && typeof gen === "object" && !Array.isArray(gen)) {
    const g = gen as Record<string, unknown>;
    const raw = g.implementationRiskScore ?? g.implementation_risk_score;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.round(Math.max(0, Math.min(100, n)));
  }
  return null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s.length > 0) return s;
  }
  return null;
}

function appendixSalesRiskBreakdown(
  report: Record<string, unknown>,
): Record<string, unknown> | null {
  const gen = report.generatedAnalysis ?? report.generated_analysis;
  if (gen == null || typeof gen !== "object" || Array.isArray(gen)) return null;
  const g = gen as Record<string, unknown>;
  const full = g.fullReport ?? g.full_report;
  if (full == null || typeof full !== "object" || Array.isArray(full))
    return null;
  const appendix = (full as Record<string, unknown>).appendix;
  if (
    appendix == null ||
    typeof appendix !== "object" ||
    Array.isArray(appendix)
  )
    return null;
  const br =
    (appendix as Record<string, unknown>).salesRiskBreakdown ??
    (appendix as Record<string, unknown>).sales_risk_breakdown;
  if (br == null || typeof br !== "object" || Array.isArray(br)) return null;
  return br as Record<string, unknown>;
}

/**
 * Vendor COTS / sales formula: classification from stored grades (appendix.salesRiskBreakdown or explicit fields).
 */
export function vendorPortalImplementationClassificationFromReport(
  report: unknown,
): string | null {
  if (report == null || typeof report !== "object") return null;
  const r = report as Record<string, unknown>;
  const gen = r.generatedAnalysis ?? r.generated_analysis;
  const g =
    gen != null && typeof gen === "object" && !Array.isArray(gen)
      ? (gen as Record<string, unknown>)
      : null;
  const breakdown = appendixSalesRiskBreakdown(r);
  return firstNonEmptyString(
    r.implementationRiskClassification,
    r.implementation_risk_classification,
    g?.implementationRiskClassification,
    g?.implementation_risk_classification,
    breakdown?.classification,
  );
}

/** Organizational / buyer IRS: decision string from stored report (assess-3). */
export function organizationalPortalImplementationDecisionFromReport(
  report: unknown,
): string | null {
  if (report == null || typeof report !== "object") return null;
  const r = report as Record<string, unknown>;
  const gen = r.generatedAnalysis ?? r.generated_analysis;
  const g =
    gen != null && typeof gen === "object" && !Array.isArray(gen)
      ? (gen as Record<string, unknown>)
      : null;
  return firstNonEmptyString(
    r.implementationRiskDecision,
    r.implementation_risk_decision,
    g?.implementationRiskDecision,
    g?.implementation_risk_decision,
  );
}

/** Mirrors backend `buyerImplementationRiskScore` interpret().decision for IRS (0–100, higher = worse). */
export function implementationRiskDecisionFromIrs(irs: number): string {
  const s = Math.max(0, Math.min(100, Math.round(Number(irs))));
  if (s >= 76) return "PROCEED";
  if (s >= 51) return "PROCEED WITH CAUTION";
  if (s >= 26) return "PROCEED WITH CAUTION";
  return "DO NOT PROCEED";
}

/** H (0–360), S and L as percentages → `rgb(r, g, b)` with 0–255 channels. */
function hslToRgbString(h: number, sPercent: number, lPercent: number): string {
  const hNorm = ((h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, sPercent)) / 100;
  const l = Math.max(0, Math.min(100, lPercent)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hNorm < 60) {
    rp = c;
    gp = x;
  } else if (hNorm < 120) {
    rp = x;
    gp = c;
  } else if (hNorm < 180) {
    gp = c;
    bp = x;
  } else if (hNorm < 240) {
    rp = x;
    bp = c;
  } else if (hNorm < 300) {
    rp = c;
    bp = x;
  } else {
    gp = x;
    bp = c;
  }
  const r = Math.round((rp + m) * 255);
  const g = Math.round((gp + m) * 255);
  const b = Math.round((bp + m) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Vendor trust / assessment grade colors on the vendor portal (lowest score → highest).
 * ≥ 90 uses {@link VENDOR_TRUST_ASSESSMENT_GRADE_COLORS}[4] (`#a1ff0a`).
 */
export const VENDOR_TRUST_ASSESSMENT_GRADE_COLORS = [
  "#ff6201",
  "#ff8700",
  "#ffba08",
  "#a1ff0a",
  "#0aff99",
] as const;

/**
 * Trust-style 0–100 score where higher is better — same breakpoints as
 * VendorDirectory `trustGradeFromScore` (A ≥ 90, B ≥ 80), plus two bands below C
 * so five colors map one-to-one.
 */
export function vendorTrustGradeTierFromTrustScore(
  trustLikeScore: number,
): 0 | 1 | 2 | 3 | 4 {
  const s = Math.max(0, Math.min(100, Math.round(Number(trustLikeScore))));
  if (s >= 90) return 4;
  if (s >= 80) return 3;
  if (s >= 70) return 2;
  if (s >= 60) return 1;
  return 0;
}
export function buyerGradeTierFromTrustScore(
  trustLikeScore: number,
): 0 | 1 | 2 | 3 | 4 {
  const s = Math.max(0, Math.min(100, Math.round(Number(trustLikeScore))));
  if (s >= 76) return 4;
  if (s >= 51) return 3;
  if (s >= 26) return 2;
  // if (s >= 10) return 1;
  return 0;
}

/** Hex color for a trust-style 0–100 score (vendor directory grade, vendor portal UI). */
export function vendorTrustGradeColorFromTrustScore(
  trustLikeScore: number,
): string {
  const tier = vendorTrustGradeTierFromTrustScore(trustLikeScore);
  return VENDOR_TRUST_ASSESSMENT_GRADE_COLORS[tier];
}

/** IRS (implementation risk, higher worse) → track color using inverted vendor-trust-style tiers (vendor COTS / vendor-facing). */
function vendorPortalRiskTrackColorFromImplementationRiskScore(
  irs: number,
): string {
  const trustLike = Math.max(0, Math.min(100, Math.round(Number(irs))));
  return vendorTrustGradeColorFromTrustScore(trustLike);
}

/**
 * Buyer org portal COTS: IRS (higher worse) → readiness `100 − IRS`, then {@link buyerGradeTierFromTrustScore} bands.
 */
export function buyerCotsIrsGradeColorFromScore(irs: number): string {
  const trustLike = Math.max(0, Math.min(100, Math.round(Number(irs))));
  const tier = buyerGradeTierFromTrustScore(trustLike);
  return VENDOR_TRUST_ASSESSMENT_GRADE_COLORS[tier];
}

/** How {@link completeReportRiskMeterColor} maps list score to fill color. */
export type CompleteReportRiskMeterGrading =
  | "default"
  | "buyer_cots_irs"
  | "vendor_cots_irs";

/**
 * Label beside IRS on complete-report cards: vendor portal / vendor_cots → classification;
 * organizational portal (buyer_cots_irs) → decision.
 */
export function resolveScoreSubtitleForCompleteReport(
  row: ReportContextScoreSource,
  grading: CompleteReportRiskMeterGrading,
): string | null {
  const irs = implementationRiskScoreFromReportPayload(row);
  if (grading === "vendor_cots_irs") {
    return firstNonEmptyString(
      row.implementationRiskDecision,
      organizationalPortalImplementationDecisionFromReport(row.report),
      irs != null ? implementationRiskDecisionFromIrs(irs) : null,
    );
  }
  if (grading === "default") {
    return firstNonEmptyString(
      row.implementationRiskClassification,
      vendorPortalImplementationClassificationFromReport(row.report),
    );
  }
  return null;
}

/**
 * Fill color for the complete-report risk meter on list cards.
 * Customer rows: continuous red → green from alignment (high good).
 * `vendor_cots_irs`: vendor COTS / buyer–vendor risk — vendor trust tiers on inverted IRS.
 * `buyer_cots_irs`: buyer org COTS — buyer trust tiers on inverted IRS.
 */
export function completeReportRiskMeterColor(
  _row: ReportContextScoreSource,
  displayScore: number,
  grading: CompleteReportRiskMeterGrading = "default",
): string {
  const n = Number(displayScore);
  const clamped = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  // if (grading === "buyer_cots_irs") {
  //   return buyerCotsIrsGradeColorFromScore(clamped);
  // }
  if (grading === "vendor_cots_irs") {
    return buyerCotsIrsGradeColorFromScore(clamped);
  } else  {
    return vendorPortalRiskTrackColorFromImplementationRiskScore(clamped);
  }
  // const t = Math.max(0, Math.min(1, clamped / 100));
  // const hue = Math.round(t * 120);
  // return hslToRgbString(hue, 72, 42);
}
