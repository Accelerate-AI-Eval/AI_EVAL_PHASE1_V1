import type { FrameworkMappingControlDetail } from "./frameworkMappingControlsDisplay";

export type MitigationRowLike = {
  mitigation_action_name?: string;
  mitigation_definition?: string | null;
  mitigation_category?: string;
  mitigation_action_id?: string;
};

export type RiskRowLike = {
  risk_id?: string | null;
  risk_title?: string | null;
  description?: string | null;
  domains?: string | null;
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "has",
  "have",
  "not",
  "may",
  "can",
  "use",
  "using",
  "used",
  "via",
  "into",
  "per",
  "all",
  "any",
  "each",
  "other",
  "such",
  "data",
  "risk",
  "risks",
  "control",
  "controls",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

function hashPick<T extends string>(seed: string, options: readonly T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return options[h % options.length]!;
}

export type ControlDetailMitigationSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ControlDetailRiskRowVM = {
  riskId: string;
  /** Optional catalog title for the risk row */
  riskTitle?: string;
  severity: ControlDetailMitigationSeverity;
  mitigationStatus: "MITIGATED" | "PARTIAL";
};

export type ControlDetailMitigationCardVM = {
  key: string;
  title: string;
  description: string;
  status: "MITIGATED" | "PARTIAL";
  reliabilityPercent: number;
  iconKind: "grid" | "chart" | "shield";
  risksAddressed: ControlDetailRiskRowVM[];
};

function severityForRiskIndex(
  severityFromScores: (idx: number) => "critical/high" | "medium" | "low",
  idx: number,
): ControlDetailMitigationSeverity {
  const s = severityFromScores(idx);
  if (s === "critical/high") return "CRITICAL";
  if (s === "medium") return "MEDIUM";
  return "LOW";
}

function mitigationStatusAndReliability(score: number): {
  mitigationStatus: "MITIGATED" | "PARTIAL";
  reliabilityPercent: number;
} {
  const mitigationStatus: "MITIGATED" | "PARTIAL" = score >= 0.1 ? "MITIGATED" : "PARTIAL";
  const reliabilityPercent =
    mitigationStatus === "MITIGATED"
      ? Math.min(100, Math.round((88 + score * 80) * 10) / 10)
      : Math.min(95, Math.round((68 + score * 120) * 10) / 10);
  return { mitigationStatus, reliabilityPercent };
}

function mitigationGroupKey(mitigation: MitigationRowLike): string {
  const id = String(mitigation.mitigation_action_id ?? "").trim();
  if (id) return `id:${id}`;
  const name = String(mitigation.mitigation_action_name ?? "").trim() || "unnamed";
  return `name:${name}`;
}

function mitigationDisplayName(mitigation: MitigationRowLike): string {
  const name = String(mitigation.mitigation_action_name ?? "").trim();
  if (name) return name;
  const category = String(mitigation.mitigation_category ?? "").trim();
  if (category) return category;
  return "Unnamed mitigation action";
}

const SEVERITY_ORDER: Record<ControlDetailMitigationSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function compareRiskRows(a: ControlDetailRiskRowVM, b: ControlDetailRiskRowVM): number {
  const da = SEVERITY_ORDER[a.severity] ?? 9;
  const db = SEVERITY_ORDER[b.severity] ?? 9;
  if (da !== db) return da - db;
  return a.riskId.localeCompare(b.riskId);
}

/**
 * Rank mitigations from assessment top risks against a framework control (token overlap).
 * Falls back to all mitigations so the detail view is never empty when risks exist.
 */
export function buildControlMitigationCards(
  control: FrameworkMappingControlDetail,
  top5Risks: RiskRowLike[],
  mitigationsByRiskId: Record<string, MitigationRowLike[]>,
  severityFromScores: (idx: number) => "critical/high" | "medium" | "low",
  maxCards = 8,
): ControlDetailMitigationCardVM[] {
  const controlHay = uniqueTokens(
    `${control.controlId} ${control.title} ${control.description}`.replace(/—/g, " "),
  );

  type Scored = {
    score: number;
    riskIdx: number;
    risk: RiskRowLike;
    mitigation: MitigationRowLike;
  };
  const scored: Scored[] = [];

  top5Risks.forEach((risk, riskIdx) => {
    const rid = String(risk.risk_id ?? "").trim();
    const mits = rid ? mitigationsByRiskId[rid] ?? [] : [];
    const riskHay = uniqueTokens(
      `${risk.risk_title ?? ""} ${risk.description ?? ""} ${risk.domains ?? ""}`,
    );
    for (const mitigation of mits) {
      const mText = `${mitigation.mitigation_action_name ?? ""} ${mitigation.mitigation_definition ?? ""} ${mitigation.mitigation_category ?? ""}`;
      const mHay = uniqueTokens(mText);
      const union = new Set([...controlHay, ...mHay, ...riskHay]);
      const tripartite =
        controlHay.size > 0 && mHay.size > 0
          ? (() => {
              let n = 0;
              for (const t of controlHay) {
                if (mHay.has(t) || riskHay.has(t)) n += 1;
              }
              return n / union.size;
            })()
          : 0;
      const score = Math.max(jaccard(controlHay, mHay), jaccard(controlHay, riskHay), tripartite);
      scored.push({ score, riskIdx, risk, mitigation });
    }
  });

  const sortAndDedupe = (): Scored[] => {
    const byKey = new Map<string, Scored>();
    for (const s of scored) {
      const rid = String(s.risk.risk_id ?? "").trim();
      const mid = String(s.mitigation.mitigation_action_id ?? s.mitigation.mitigation_action_name ?? "").trim();
      const key = `${rid}::${mid}`;
      const prev = byKey.get(key);
      if (!prev || s.score > prev.score) byKey.set(key, s);
    }
    return [...byKey.values()].sort((a, b) => b.score - a.score);
  };

  let ordered = sortAndDedupe();
  const threshold = 0.04;
  let candidateRows = ordered.filter((s) => s.score >= threshold);
  if (candidateRows.length === 0 && ordered.length > 0) {
    candidateRows = ordered.slice(0, Math.min(maxCards * 12, ordered.length));
  }
  const maxRowsBeforeGroup = 240;
  if (candidateRows.length > maxRowsBeforeGroup) {
    candidateRows = candidateRows.slice(0, maxRowsBeforeGroup);
  }

  type GroupAgg = {
    mitigation: MitigationRowLike;
    rows: Scored[];
    maxScore: number;
  };
  const byMit = new Map<string, GroupAgg>();
  for (const s of candidateRows) {
    const gk = mitigationGroupKey(s.mitigation);
    const prev = byMit.get(gk);
    if (!prev) {
      byMit.set(gk, { mitigation: s.mitigation, rows: [s], maxScore: s.score });
    } else {
      prev.rows.push(s);
      if (s.score > prev.maxScore) prev.maxScore = s.score;
    }
  }

  const groups = [...byMit.values()].sort((a, b) => b.maxScore - a.maxScore).slice(0, maxCards);

  return groups.map((g) => {
    const groupRowsByScore = [...g.rows].sort((a, b) => b.score - a.score);
    const mitigationForTitle =
      groupRowsByScore.find((s) => String(s.mitigation.mitigation_action_name ?? "").trim())?.mitigation ??
      g.mitigation;
    const title = mitigationDisplayName(mitigationForTitle);
    const description =
      groupRowsByScore
        .map((s) => String(s.mitigation.mitigation_definition ?? "").trim())
        .find(Boolean) ?? "Mitigation definition not available.";

    const bestByRiskId = new Map<string, { score: number; row: ControlDetailRiskRowVM }>();
    for (const s of g.rows) {
      const rid = String(s.risk.risk_id ?? "").trim();
      const displayId = rid || `RSK_${String(s.riskIdx + 1).padStart(4, "0")}`;
      const sev = severityForRiskIndex(severityFromScores, s.riskIdx);
      const { mitigationStatus } = mitigationStatusAndReliability(s.score);
      const riskTitle = String(s.risk.risk_title ?? "").trim() || undefined;
      const prev = bestByRiskId.get(displayId);
      if (!prev || s.score > prev.score) {
        bestByRiskId.set(displayId, {
          score: s.score,
          row: { riskId: displayId, riskTitle, severity: sev, mitigationStatus },
        });
      }
    }

    const risksAddressed = [...bestByRiskId.values()]
      .map((v) => v.row)
      .sort(compareRiskRows);

    const relValues = g.rows.map((s) => mitigationStatusAndReliability(s.score).reliabilityPercent);
    const reliabilityPercent =
      relValues.length > 0
        ? Math.min(100, Math.round((relValues.reduce((a, b) => a + b, 0) / relValues.length) * 10) / 10)
        : 0;
    const status: "MITIGATED" | "PARTIAL" = risksAddressed.every((r) => r.mitigationStatus === "MITIGATED")
      ? "MITIGATED"
      : "PARTIAL";

    const seed = `${mitigationGroupKey(g.mitigation)}-${title}`;
    const iconKind = hashPick(seed, ["grid", "chart", "shield"] as const);
    return {
      key: mitigationGroupKey(g.mitigation),
      title,
      description,
      status,
      reliabilityPercent,
      iconKind,
      risksAddressed,
    };
  });
}
