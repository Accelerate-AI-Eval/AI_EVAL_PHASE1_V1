/**
 * Letter grade from a risk-like score (0-100, higher = worse).
 * - `vendor`: mirrors backend `interpretSalesRiskScore` via dealProbability = 100 - risk.
 * - `buyer`: mirrors backend `buyerImplementationRiskScore` / Python `_interpret` on stored IRS (higher = more ready).
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
    if (s >= 76) return "A";
    if (s >= 51) return "B";
    if (s >= 26) return "C";
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

  const tryNum = (raw: unknown): number | null => {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
  };

  const gen = r.generatedAnalysis ?? r.generated_analysis;
  if (gen != null && typeof gen === "object" && !Array.isArray(gen)) {
    const g = gen as Record<string, unknown>;
    const fromGen = tryNum(g.overallRiskScore ?? g.overall_risk_score);
    if (fromGen != null) return fromGen;
  }

  const fromTop = tryNum(r.overallRiskScore ?? r.overall_risk_score);
  if (fromTop != null) return fromTop;

  const breakdown = appendixSalesRiskBreakdown(r);
  if (breakdown != null) {
    const fromAppendix = tryNum(breakdown.sales_risk_score ?? breakdown.salesRiskScore);
    if (fromAppendix != null) return fromAppendix;
  }

  return null;
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

/** Invert a 0–100 score (readiness ↔ residual risk). */
export function invertScore100(score: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - score)));
}

/** Readiness / alignment score shown on the complete report (100 − risk). */
export function alignmentScoreFromRiskScore(riskScore: number): number {
  return invertScore100(riskScore);
}

/** Card/list payload: alignment score for customer reports; IRS (0–100) for buyer vendor risk rows. */
export interface ReportContextScoreSource {
  report?: Record<string, unknown>;
  source?: "customer" | "buyer_vendor_risk";
  /** List API: vendor COTS sales risk (SRS) when report JSON is sparse. */
  overallRiskScore?: number | null;
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
  const listRisk =
    row.overallRiskScore != null && Number.isFinite(Number(row.overallRiskScore))
      ? Number(row.overallRiskScore)
      : null;
  const risk = listRisk ?? overallRiskScoreFromReportJson(row.report);
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
 * ≥ 90 uses {@link VENDOR_TRUST_ASSESSMENT_GRADE_COLORS}[4] (`#059669`).
 * Top bands stay in the emerald range: neon greens wash out on light card backgrounds.
 */
export const VENDOR_TRUST_ASSESSMENT_GRADE_COLORS = [
  "#ff6201",
  "#ff8700",
  "#ffba08",
  "#34a853",
  "#059669",
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
  if (grading === "buyer_cots_irs") {
    return firstNonEmptyString(
      vendorPortalImplementationClassificationFromReport(row.report),
      row.implementationRiskClassification,
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

export type ScoreRationaleType = "VTS" | "SCS" | "SRS" | "IRS";

export interface ScoreRationaleResult {
  title: string;
  rationale: string | null;
}

function normalizeScoreRationaleType(raw: unknown): ScoreRationaleType | null {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "SRS") return "SCS";
  if (s === "VTS" || s === "SCS" || s === "IRS") return s;
  return null;
}

function reportRecordFromRow(row: ReportContextScoreSource): Record<string, unknown> | null {
  const rep = row.report;
  if (rep == null || typeof rep !== "object" || Array.isArray(rep)) return null;
  return rep as Record<string, unknown>;
}

function storedScoreRationaleFromReport(
  report: Record<string, unknown>,
): { type: ScoreRationaleType | null; text: string | null } {
  const gen = report.generatedAnalysis ?? report.generated_analysis;
  const g =
    gen != null && typeof gen === "object" && !Array.isArray(gen)
      ? (gen as Record<string, unknown>)
      : null;
  const text = firstNonEmptyString(
    report.scoreRationale,
    report.score_rationale,
    g?.scoreRationale,
    g?.score_rationale,
    report.implementationRiskRationale,
    report.implementation_risk_rationale,
    g?.implementationRiskRationale,
    g?.implementation_risk_rationale,
    (() => {
      const ts = report.trustScore;
      if (ts != null && typeof ts === "object" && !Array.isArray(ts)) {
        return (ts as Record<string, unknown>).scoreRationale;
      }
      return null;
    })(),
  );
  const type =
    normalizeScoreRationaleType(report.scoreRationaleType ?? report.score_rationale_type) ??
    normalizeScoreRationaleType(g?.scoreRationaleType ?? g?.score_rationale_type) ??
    (text && /SALES RISK SCORE \(Type 2\)|SCS RATIONALE|SRS RATIONALE/i.test(String(text))
      ? "SCS"
      : null) ??
    (text && /IMPLEMENTATION READINESS SCORE \(Type 3\)|IRS RATIONALE/i.test(String(text))
      ? "IRS"
      : null) ??
    (text && /VENDOR TRUST SCORE \(Type 1\) - EXPLAINED|VTS RATIONALE/i.test(String(text))
      ? "VTS"
      : null) ??
    (text && implementationRiskScoreFromReportPayload({ report }) != null ? "IRS" : null) ??
    (text && overallRiskScoreFromReportJson(report) != null ? "SCS" : null);
  return { type, text };
}

function buildSrsRationaleFallback(report: Record<string, unknown>): string | null {
  const breakdown = appendixSalesRiskBreakdown(report);
  const srs =
    overallRiskScoreFromReportJson(report) ??
    (breakdown != null ? Number(breakdown.sales_risk_score) : NaN);
  if (!Number.isFinite(srs) && breakdown == null) return null;

  const scoreNum = Number.isFinite(srs) ? Math.max(0, Math.min(100, Number(srs))) : null;
  const scoreLabel =
    scoreNum != null
      ? Number.isInteger(scoreNum)
        ? String(scoreNum)
        : scoreNum.toFixed(2)
      : null;
  const cfr = breakdown != null ? Number(breakdown.customer_friction_risk) : NaN;
  const ir = breakdown != null ? Number(breakdown.implementation_risk) : NaN;
  const cr = breakdown != null ? Number(breakdown.competitive_risk) : NaN;
  const deal =
    breakdown != null && Number.isFinite(Number(breakdown.deal_probability_pct))
      ? Math.round(Number(breakdown.deal_probability_pct))
      : scoreNum != null
        ? Math.max(0, Math.min(100, Math.round(100 - scoreNum)))
        : null;
  const grade = breakdown != null ? String(breakdown.grade ?? "").trim() : "";
  const classification =
    breakdown != null ? String(breakdown.classification ?? "").trim() : "";
  const dealChars =
    breakdown != null
      ? String(breakdown.deal_characteristics ?? breakdown.dealCharacteristics ?? "").trim()
      : "";
  const recommended =
    breakdown != null
      ? String(breakdown.recommended_actions ?? breakdown.recommendedActions ?? "").trim()
      : "";

  const drivers = [
    { name: "Customer friction", risk: cfr, weight: 0.35, tip: "Address data sensitivity / compliance documentation" },
    { name: "Implementation", risk: ir, weight: 0.35, tip: "Add concrete risk mitigations per customer concern" },
    { name: "Competitive", risk: cr, weight: 0.3, tip: "Differentiate vs alternatives / build-vs-buy" },
  ]
    .filter((d) => Number.isFinite(d.risk))
    .sort((a, b) => b.risk * b.weight - a.risk * a.weight);

  const lines: string[] = [
    "SALES RISK SCORE (Type 2) - EXPLAINED",
    "========================================================================",
    "",
    "RESULT",
    scoreLabel != null
      ? `  Sales risk:         ${scoreLabel} / 100   (higher = harder deal)`
      : "  Sales risk:         — / 100   (higher = harder deal)",
  ];
  if (deal != null) {
    lines.push(`  Deal probability:   ~${deal}%     (roughly 100 - sales risk)`);
  }
  if (grade || classification) {
    lines.push(`  Grade:              ${[grade, classification].filter(Boolean).join(" - ")}`);
  }
  if (dealChars) lines.push(`  Deal picture:       ${dealChars}`);
  if (recommended) lines.push(`  Recommended move:   ${recommended}`);

  lines.push(
    "",
    "KEY DRIVERS (higher = more sales risk):",
  );

  if (drivers.length > 0) {
    drivers.forEach((d, idx) => {
      const biggest = idx === 0 ? "  << biggest drag" : "";
      const namePad = d.name.padEnd(22, " ");
      lines.push(
        `    ${idx + 1}. ${namePad} ${Number(d.risk).toFixed(2)}${biggest}`,
      );
    });
  }

  lines.push("", "WHAT TO IMPROVE (to lower sales risk / raise deal odds)");
  if (drivers.length > 0) {
    drivers.slice(0, 3).forEach((d, idx) => {
      lines.push(`  ${idx + 1}. ${d.name} (${Number(d.risk).toFixed(1)}) - ${d.tip}`);
    });
  } else {
    lines.push("  Risks look low - keep the standard sales path and reinforce value proof.");
  }

  return lines.join("\n");
}

function stripSummaryFromRationale(text: string): string {
  const withoutSummary = text
    .replace(/\n+Summary:\s*[\s\S]*$/i, "")
    .replace(/\n+SUMMARY\s*\n[\s\S]*$/i, "")
    .trim();
  return withoutSummary;
}

/** Remove formula / weight methodology blocks from stored rationale (legacy reports). */
function stripFormulaDiscussionFromRationale(text: string): string {
  return text
    .replace(
      /\n*HOW WE GOT HERE\n[\s\S]*?(?=\n(?:WHAT TO IMPROVE|KEY DRIVERS|RESULT)\b|$)/i,
      "\n",
    )
    .replace(/\n*\s*Method:\s*[^\n]*formula[^\n]*/gi, "")
    .replace(/\n*\s*Idea:\s*[^\n]*(?:weighted|minus weighted|blends three)[^\n]*/gi, "")
    .replace(/\n*\s*Weights:\s*[^\n]*/gi, "")
    .replace(/\s*\(weight\s+\d+%\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readinessProfileFromScore(readiness: number): string {
  const s = Math.max(0, Math.min(100, Math.round(Number(readiness))));
  if (s >= 76) return "Organization ready; vendor capable; integration straightforward";
  if (s >= 51) return "Some gaps exist; manageable with planning";
  if (s >= 26) return "Significant gaps; risk of failure if not addressed.";
  return "Major gaps across dimensions; additional preparation needed";
}

function buildIrsRationaleFallback(
  row: ReportContextScoreSource,
  report: Record<string, unknown>,
): string | null {
  const readiness = implementationRiskScoreFromReportPayload(row);
  if (readiness == null) return null;

  const gen = report.generatedAnalysis ?? report.generated_analysis;
  const g =
    gen != null && typeof gen === "object" && !Array.isArray(gen)
      ? (gen as Record<string, unknown>)
      : null;

  const gradeLetter = firstNonEmptyString(
    report.implementationReadinessGrade,
    g?.implementationReadinessGrade,
  );
  const classification = firstNonEmptyString(
    report.implementationRiskClassification,
    g?.implementationRiskClassification,
  );
  const grade =
    gradeLetter && classification
      ? `${gradeLetter} - ${classification}`
      : gradeLetter ?? classification ?? null;
  const decision = firstNonEmptyString(
    row.implementationRiskDecision,
    report.implementationRiskDecision,
    g?.implementationRiskDecision,
    implementationRiskDecisionFromIrs(readiness),
  );
  const profile = firstNonEmptyString(
    report.readinessProfile,
    report.readiness_profile,
    g?.readinessProfile,
    g?.readiness_profile,
    readinessProfileFromScore(readiness),
  );
  const nextStep = firstNonEmptyString(
    report.implementationRiskRecommendedAction,
    g?.implementationRiskRecommendedAction,
    report.recommendedAction,
    g?.recommendedAction,
  );
  const breakdown =
    (report.implementationRiskBreakdown ??
      g?.implementationRiskBreakdown ??
      report.implementation_risk_breakdown) as Record<string, unknown> | undefined;
  const source =
    (report.implementationRiskSource ??
      g?.implementationRiskSource ??
      report.source) as Record<string, unknown> | undefined;

  const vendorName = firstNonEmptyString(
    report.vendorName,
    report.vendor_name,
    source?.vendorName,
    source?.vendor_name,
  );
  const productName = firstNonEmptyString(
    report.productName,
    report.product_name,
    source?.productName,
    source?.product_name,
  );
  const vendorLabel =
    vendorName && productName
      ? `${vendorName} / ${productName}`
      : vendorName ?? productName ?? "Vendor / Product";

  const vendorRisk = breakdown != null ? Number(breakdown.vendorRisk ?? breakdown.vendor_risk) : NaN;
  const orgGap = breakdown != null
    ? Number(breakdown.organizationalReadinessGap ?? breakdown.organizational_readiness_gap)
    : NaN;
  const integ = breakdown != null ? Number(breakdown.integrationRisk ?? breakdown.integration_risk) : NaN;
  const vts = breakdown != null ? Number(breakdown.vendorTrustScore ?? breakdown.vendor_trust_score) : NaN;
  const usedAttestation = source?.usedAttestation === true || source?.used_attestation === true;

  const drivers = [
    {
      name: "Integration risk",
      risk: integ,
      weight: 0.3,
      tip: "Reduce system integrations, gain product familiarity, add rollback/monitoring/testing",
    },
    {
      name: "Org readiness gap",
      risk: orgGap,
      weight: 0.35,
      tip: "Raise digital/governance maturity, AI board/policy, and implementation team coverage",
    },
    {
      name: "Vendor risk",
      risk: vendorRisk,
      weight: 0.35,
      tip: "Choose a higher-trust vendor product, or improve vendor attestation evidence",
    },
  ]
    .filter((d) => Number.isFinite(d.risk))
    .sort((a, b) => b.risk * b.weight - a.risk * a.weight);

  const lines: string[] = [
    "IMPLEMENTATION READINESS SCORE (Type 3) - EXPLAINED",
    "========================================================================",
    "",
    "RESULT",
    `  Readiness:   ${Math.round(readiness)} / 100   (higher = more ready to implement)`,
  ];
  if (grade) lines.push(`  Grade:       ${grade}`);
  if (decision) lines.push(`  Decision:    ${decision}`);
  if (profile) lines.push(`  Profile:     ${profile}`);
  if (nextStep) lines.push(`  Next step:   ${nextStep}`);
  lines.push(`  Vendor:      ${vendorLabel}`);

  lines.push(
    "",
    "KEY DRIVERS (higher risk lowers readiness):",
  );

  if (drivers.length > 0) {
    drivers.forEach((d, idx) => {
      const biggest = idx === 0 ? "  << biggest drag" : "";
      const namePad = d.name.padEnd(22, " ");
      lines.push(
        `    ${idx + 1}. ${namePad} ${Number(d.risk).toFixed(2)}${biggest}`,
      );
    });
  }

  if (Number.isFinite(vts)) {
    lines.push(
      `  Vendor trust used: ${Math.round(vts)}/100  (${usedAttestation ? "from selected product attestation" : "default / limited attestation"})`,
    );
  }

  lines.push("", "WHAT TO IMPROVE (to raise readiness)");
  if (drivers.length > 0) {
    const top = drivers[0];
    lines.push(
      `  1. Biggest drag: ${top.name} (${Number(top.risk).toFixed(1)}) - ${top.tip}`,
    );
    if (drivers.length > 1) {
      const second = drivers[1];
      lines.push(`  2. ${second.name} (${Number(second.risk).toFixed(1)}) - ${second.tip}`);
    }
    if (drivers.length > 2) {
      const third = drivers[2];
      lines.push(`  3. ${third.name} (${Number(third.risk).toFixed(1)}) - ${third.tip}`);
    }
  } else {
    lines.push("  No major drivers detected from stored breakdown.");
  }

  return lines.join("\n");
}

function scoreRationaleTitle(type: ScoreRationaleType): string {
  if (type === "VTS") return "VTS Rationale";
  if (type === "IRS") return "IRS Rationale";
  return "SCS Rationale";
}

function preferredRationaleTypesForGrading(
  grading: CompleteReportRiskMeterGrading,
): ScoreRationaleType[] {
  // Org portal vendor COTS cards use buyer_cots_irs grading for meter colors but
  // the stored complete report score is SCS (overallRiskScore), so prefer SCS first.
  if (grading === "buyer_cots_irs") {
    return ["SCS", "IRS"];
  }
  if (grading === "vendor_cots_irs") {
    return ["IRS", "SCS"];
  }
  return ["SCS", "IRS"];
}

/**
 * Resolve type-specific score rationale for complete-report cards (SCS / IRS).
 * Prefers stored Python rationale; falls back to breakdown fields in report JSON.
 */
export function resolveScoreRationaleForCompleteReport(
  row: ReportContextScoreSource,
  grading: CompleteReportRiskMeterGrading = "default",
): ScoreRationaleResult {
  const report = reportRecordFromRow(row);
  const preferredTypes = preferredRationaleTypesForGrading(grading);

  if (report != null) {
    const stored = storedScoreRationaleFromReport(report);
    const rebuiltSrs = buildSrsRationaleFallback(report);
    const rebuiltIrs = buildIrsRationaleFallback(row, report);

    if (stored.text) {
      const type =
        (stored.type && preferredTypes.includes(stored.type) ? stored.type : null) ??
        stored.type ??
        preferredTypes[0];

      // SCS: prefer Type 2 explained text (no summary). Use stored when already Type 2.
      if (type === "SCS" || type === "SRS") {
        if (stored.text.includes("SALES RISK SCORE (Type 2)")) {
          return {
            title: scoreRationaleTitle("SCS"),
            rationale: stripFormulaDiscussionFromRationale(
              stripSummaryFromRationale(stored.text),
            ),
          };
        }
        if (rebuiltSrs?.trim()) {
          return { title: scoreRationaleTitle("SCS"), rationale: rebuiltSrs.trim() };
        }
        return {
          title: scoreRationaleTitle("SCS"),
          rationale: stripFormulaDiscussionFromRationale(
            stripSummaryFromRationale(stored.text),
          ),
        };
      }

      // IRS: prefer Type 3 explained text. Rebuild from breakdown when stored is legacy.
      if (type === "IRS") {
        if (stored.text.includes("IMPLEMENTATION READINESS SCORE (Type 3)")) {
          return {
            title: scoreRationaleTitle("IRS"),
            rationale: stripFormulaDiscussionFromRationale(
              stripSummaryFromRationale(stored.text),
            ),
          };
        }
        if (rebuiltIrs?.trim()) {
          return { title: scoreRationaleTitle("IRS"), rationale: rebuiltIrs.trim() };
        }
        return {
          title: scoreRationaleTitle("IRS"),
          rationale: stripFormulaDiscussionFromRationale(
            stripSummaryFromRationale(stored.text),
          ),
        };
      }

      return {
        title: scoreRationaleTitle(type),
        rationale: stripFormulaDiscussionFromRationale(stored.text),
      };
    }

    for (const type of preferredTypes) {
      const fallback = type === "IRS" ? rebuiltIrs : rebuiltSrs;
      if (fallback?.trim()) {
        return { title: scoreRationaleTitle(type), rationale: fallback.trim() };
      }
    }
  }

  return { title: scoreRationaleTitle(preferredTypes[0]), rationale: null };
}
