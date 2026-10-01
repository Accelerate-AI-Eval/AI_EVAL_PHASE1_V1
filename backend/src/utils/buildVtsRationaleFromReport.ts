export interface VtsRationaleSource {
  trustScore?: number | null;
  grade?: string | null;
  classification?: string | null;
  productRisk?: number | null;
  governanceRisk?: number | null;
  operationalRisk?: number | null;
  recommendedAction?: string | null;
  scoringSource?: string | null;
  report?: unknown;
  formulaDetail?: unknown;
}

function tryNum(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s.length > 0) return s;
  }
  return null;
}

function trustScoreFromReport(report: unknown): number | null {
  if (report == null || typeof report !== "object" || Array.isArray(report)) return null;
  const r = report as Record<string, unknown>;
  const ts = r.trustScore;
  if (ts != null && typeof ts === "object" && !Array.isArray(ts)) {
    const overall = tryNum((ts as Record<string, unknown>).overallScore);
    if (overall != null) return Math.min(100, Math.max(0, Math.round((overall + Number.EPSILON) * 100) / 100));
  }
  return tryNum(r.trust_score);
}

function scoreByCategoryFromReport(report: unknown): Record<string, unknown> | null {
  if (report == null || typeof report !== "object" || Array.isArray(report)) return null;
  const ts = (report as Record<string, unknown>).trustScore;
  if (ts == null || typeof ts !== "object" || Array.isArray(ts)) return null;
  const cats = (ts as Record<string, unknown>).scoreByCategory;
  if (cats != null && typeof cats === "object" && !Array.isArray(cats)) {
    return cats as Record<string, unknown>;
  }
  return null;
}

function risksFromFormulaDetail(formulaDetail: unknown): {
  productRisk: number | null;
  governanceRisk: number | null;
  operationalRisk: number | null;
  recommendedAction: string | null;
  scoringSource: string | null;
} {
  if (formulaDetail == null || typeof formulaDetail !== "object" || Array.isArray(formulaDetail)) {
    return {
      productRisk: null,
      governanceRisk: null,
      operationalRisk: null,
      recommendedAction: null,
      scoringSource: null,
    };
  }
  const d = formulaDetail as Record<string, unknown>;
  const grObj = d.governance_risk ?? d.governanceRisk;
  const orObj = d.operational_risk ?? d.operationalRisk;
  const prNested = d.product_risk ?? d.productRisk;
  let productRisk =
    tryNum(d.product_risk) ??
    (prNested != null && typeof prNested === "object" && !Array.isArray(prNested)
      ? tryNum((prNested as Record<string, unknown>).value) ??
        tryNum((prNested as Record<string, unknown>).product_risk)
      : null);
  const governanceRisk =
    tryNum(d.governance_risk) ??
    (grObj != null && typeof grObj === "object" && !Array.isArray(grObj)
      ? tryNum((grObj as Record<string, unknown>).value)
      : null);
  const operationalRisk =
    tryNum(d.operational_risk) ??
    (orObj != null && typeof orObj === "object" && !Array.isArray(orObj)
      ? tryNum((orObj as Record<string, unknown>).value)
      : null);

  return {
    productRisk,
    governanceRisk,
    operationalRisk,
    recommendedAction: firstNonEmpty(d.recommended_action, d.recommendedAction),
    scoringSource: firstNonEmpty(d.scoring_source, d.scoringSource),
  };
}

export function isExplainedVtsRationale(text: string | null | undefined): boolean {
  if (typeof text !== "string" || !text.trim()) return false;
  return /VENDOR TRUST SCORE \(Type 1\) - EXPLAINED/i.test(text);
}

/**
 * Rebuild VENDOR TRUST SCORE (Type 1) - EXPLAINED from stored profile report + VTS columns.
 * Mirrors Python {@link print_vts_rationale} for list API / backfill fallbacks.
 */
export function buildVtsRationaleFromReport(source: VtsRationaleSource): string | null {
  const report = source.report;
  const fromDetail = risksFromFormulaDetail(source.formulaDetail);

  const trustScore =
    tryNum(source.trustScore) ??
    trustScoreFromReport(report);
  if (trustScore == null) return null;

  const productRisk = tryNum(source.productRisk) ?? fromDetail.productRisk;
  const governanceRisk = tryNum(source.governanceRisk) ?? fromDetail.governanceRisk;
  const operationalRisk = tryNum(source.operationalRisk) ?? fromDetail.operationalRisk;
  if (
    productRisk == null &&
    governanceRisk == null &&
    operationalRisk == null
  ) {
    return null;
  }

  const pr = productRisk ?? 0;
  const gr = governanceRisk ?? 0;
  const opr = operationalRisk ?? 0;

  const grade =
    firstNonEmpty(source.grade, (() => {
      if (report == null || typeof report !== "object") return null;
      const ts = (report as Record<string, unknown>).trustScore;
      if (ts != null && typeof ts === "object" && !Array.isArray(ts)) {
        return (ts as Record<string, unknown>).grade;
      }
      return null;
    })()) ?? "?";

  const classification =
    firstNonEmpty(source.classification, (() => {
      if (report == null || typeof report !== "object") return null;
      const ts = (report as Record<string, unknown>).trustScore;
      if (ts != null && typeof ts === "object" && !Array.isArray(ts)) {
        return (ts as Record<string, unknown>).label;
      }
      return null;
    })()) ?? "-";

  const recommendedAction = firstNonEmpty(source.recommendedAction, fromDetail.recommendedAction) ?? "-";
  const scoringSource = firstNonEmpty(source.scoringSource, fromDetail.scoringSource) ?? "llm";

  const drivers = [
    {
      name: "Product risk",
      risk: pr,
      weight: 0.4,
      tip: "mitigations, domain coverage, evidence quality",
    },
    {
      name: "Governance risk",
      risk: gr,
      weight: 0.3,
      tip: "certs, policies, assessment quality, maturity",
    },
    {
      name: "Operational risk",
      risk: opr,
      weight: 0.3,
      tip: "SLA, incident management, deployment maturity, support",
    },
  ].sort((a, b) => b.risk * b.weight - a.risk * a.weight);

  const categories = scoreByCategoryFromReport(report);
  const concrete: string[] = [];
  if (categories) {
    const weak: Array<{ name: string; val: number | string }> = [];
    for (const [name, raw] of Object.entries(categories)) {
      if (typeof raw === "string" && /not enough/i.test(raw)) {
        weak.push({ name, val: raw });
        continue;
      }
      const n = tryNum(raw);
      if (n != null && n < 80) weak.push({ name, val: n });
    }
    weak.sort((a, b) => {
      const av = typeof a.val === "number" ? a.val : 999;
      const bv = typeof b.val === "number" ? b.val : 999;
      return av - bv;
    });
    for (const { name, val } of weak.slice(0, 4)) {
      if (typeof val === "string") {
        concrete.push(`Strengthen ${name}: add concrete evidence in attestation`);
      } else {
        const tip =
          val >= 70
            ? "strengthen controls & proof"
            : "document policies, certs, testing, or SLAs";
        concrete.push(`Raise ${name} (${val}/100) - ${tip}`);
      }
    }
  }

  const lines: string[] = [
    "VENDOR TRUST SCORE (Type 1) - EXPLAINED",
    "=".repeat(72),
    "",
    "RESULT",
    `  Trust score:   ${(Math.round((trustScore + Number.EPSILON) * 100) / 100).toFixed(2)} / 100   (higher = more trustworthy)`,
    `  Grade:         ${grade} - ${classification}`,
    `  Next step:     ${recommendedAction}`,
    `  Source:        ${scoringSource}`,
    "",
    "KEY DRIVERS (higher risk lowers trust):",
  ];

  drivers.forEach((d, idx) => {
    const biggest = idx === 0 ? "  << biggest drag" : "";
    lines.push(
      `    ${idx + 1}. ${d.name.padEnd(22)} ${Number(d.risk).toFixed(2)}${biggest}`,
    );
  });

  lines.push("", "WHAT TO IMPROVE (to raise trust score)");
  if (drivers.length > 0) {
    const top = drivers[0];
    lines.push(`  1. Biggest drag: ${top.name} (${top.risk.toFixed(1)}) - ${top.tip}`);
    if (drivers.length > 1) {
      const second = drivers[1];
      lines.push(`  2. ${second.name} (${second.risk.toFixed(1)}) - ${second.tip}`);
    }
  }
  if (concrete.length > 0) {
    lines.push("  3. From attestation evidence, prioritize:");
    for (const item of concrete.slice(0, 8)) {
      lines.push(`       - ${item}`);
    }
  } else if (drivers.length > 2) {
    const third = drivers[2];
    lines.push(`  3. ${third.name} (${third.risk.toFixed(1)}) - ${third.tip}`);
  } else {
    lines.push(
      "  Trust signals look solid - keep evidence current and renew certifications on schedule.",
    );
  }

  lines.push("");
  return lines.join("\n");
}
