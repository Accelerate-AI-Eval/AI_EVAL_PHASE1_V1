import {
  appendixSalesRiskBreakdown,
  extractOverallRiskScoreFromReport,
} from "./mergeScoreRationale.js";

/**
 * Rebuild SALES RISK SCORE (Type 2) - EXPLAINED text from stored vendor report JSON.
 * Mirrors frontend {@link buildSrsRationaleFallback} for list API / backfill fallbacks.
 */
export function buildScsRationaleFromReport(report: unknown): string | null {
  if (report == null || typeof report !== "object" || Array.isArray(report)) return null;
  const r = report as Record<string, unknown>;

  const breakdown = appendixSalesRiskBreakdown(r);
  const srs =
    extractOverallRiskScoreFromReport(r) ??
    (breakdown != null ? Number(breakdown.sales_risk_score ?? breakdown.salesRiskScore) : NaN);
  if (!Number.isFinite(srs) && breakdown == null) return null;

  const scoreNum = Number.isFinite(srs) ? Math.max(0, Math.min(100, Number(srs))) : null;
  const scoreLabel =
    scoreNum != null
      ? Number.isInteger(scoreNum)
        ? String(scoreNum)
        : scoreNum.toFixed(2)
      : null;

  const cfr =
    breakdown != null
      ? Number(breakdown.customer_friction_risk ?? breakdown.customerFrictionRisk)
      : NaN;
  const ir =
    breakdown != null
      ? Number(breakdown.implementation_risk ?? breakdown.implementationRisk)
      : NaN;
  const cr =
    breakdown != null ? Number(breakdown.competitive_risk ?? breakdown.competitiveRisk) : NaN;
  const deal =
    breakdown != null && Number.isFinite(Number(breakdown.deal_probability_pct ?? breakdown.dealProbabilityPct))
      ? Math.round((Number(breakdown.deal_probability_pct ?? breakdown.dealProbabilityPct) + Number.EPSILON) * 100) / 100
      : scoreNum != null
        ? Math.round((Math.max(0, Math.min(100, 100 - scoreNum)) + Number.EPSILON) * 100) / 100
        : null;
  const grade = breakdown != null ? String(breakdown.grade ?? "").trim() : "";
  const classification = breakdown != null ? String(breakdown.classification ?? "").trim() : "";
  const dealChars =
    breakdown != null
      ? String(breakdown.deal_characteristics ?? breakdown.dealCharacteristics ?? "").trim()
      : "";
  const recommended =
    breakdown != null
      ? String(breakdown.recommended_actions ?? breakdown.recommendedActions ?? "").trim()
      : "";

  const drivers = [
    {
      name: "Customer friction",
      risk: cfr,
      weight: 0.35,
      tip: "Address data sensitivity / compliance documentation",
    },
    {
      name: "Implementation",
      risk: ir,
      weight: 0.35,
      tip: "Add concrete risk mitigations per customer concern",
    },
    {
      name: "Competitive",
      risk: cr,
      weight: 0.3,
      tip: "Differentiate vs alternatives / build-vs-buy",
    },
  ]
    .filter((d) => Number.isFinite(d.risk))
    .sort((a, b) => b.risk * b.weight - a.risk * a.weight);

  const lines: string[] = [
    "SALES RISK SCORE (Type 2) - EXPLAINED",
    "=".repeat(72),
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

  lines.push("", "KEY DRIVERS (higher = more sales risk):");

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
