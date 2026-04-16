/**
 * Letter grade for customer risk / complete reports from overallRiskScore (0–100).
 * Higher score = more risk; A = lowest risk band, F = highest.
 */
export type CompleteReportLetterGrade = "A" | "B" | "C" | "D" | "E" | "F";

export function gradeFromOverallRiskScore(score: number): CompleteReportLetterGrade {
  const s = Math.max(0, Math.min(100, Math.round(Number(score))));
  if (s <= 16) return "A";
  if (s <= 33) return "B";
  if (s <= 50) return "C";
  if (s <= 66) return "D";
  if (s <= 83) return "E";
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
  const L = String(riskLevel ?? "").trim().toLowerCase();
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
}

/**
 * Score shown on complete-report cards (same basis as ReportDetail vendor context score for customer rows).
 * Buyer vendor risk rows use implementation risk score from the merged assessment report.
 */
export function reportContextScoreFromListPayload(row: ReportContextScoreSource): number | null {
  if (row.source === "buyer_vendor_risk") {
    const irs = row.implementationRiskScore;
    if (irs != null && Number.isFinite(Number(irs))) return Math.round(Math.max(0, Math.min(100, Number(irs))));
    return null;
  }
  const risk = overallRiskScoreFromReportJson(row.report);
  return risk != null ? alignmentScoreFromRiskScore(risk) : null;
}
