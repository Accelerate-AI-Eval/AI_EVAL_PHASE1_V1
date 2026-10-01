/**
 * LEGACY — Buyer Implementation Risk Score formula now runs in Python
 * (`python/services/buyer_implementation_risk_formula.py` via
 * POST /assessment/cots-buyer/score). Kept for reference / unit tests only.
 * Runtime path: scoreCotsBuyerWithPython in pythonScoringClient.ts.
 */

type Breakdown = {
  vendorRisk: number;
  organizationalReadinessGap: number;
  integrationRisk: number;
  vendorTrustScore: number;
};

export type BuyerImplementationRiskScore = {
  implementationRiskScore: number;
  grade: "A" | "B" | "C" | "D";
  classification:
    | "High Readiness"
    | "Moderate Readiness"
    | "Low Readiness"
    | "Readiness Review Required";
  decision: "PROCEED" | "PROCEED WITH CAUTION" | "DO NOT PROCEED";
  /** Readiness narrative from interpret(); optional for legacy callers. */
  readiness_profile?: string;
  recommendedAction: string;
  formula: string;
  breakdown: Breakdown;
  source: {
    vendorName: string;
    productName: string;
    usedAttestation: boolean;
  };
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
}

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function boolYes(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = norm(v);
  return s.startsWith("yes") || s === "true" || s === "available" || s === "exists" || s === "defined";
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return String(v).trim() === "";
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((v) => !isEmpty(v));
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => !isEmpty(val))
      .map(([key, val]) => (typeof val === "string" ? `${key}:${val}` : key));
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
      if (parsed && typeof parsed === "object") return parseList(parsed);
    } catch {
      // no-op
    }
    return t.split(/,|;|\r?\n/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function attestationGet(row: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) {
    if (!isEmpty(row[key])) return row[key];
  }
  for (const value of Object.values(row)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = value as Record<string, unknown>;
    for (const key of keys) {
      if (!isEmpty(nested[key])) return nested[key];
    }
  }
  return undefined;
}

function vtsFromEvidence(evidence: unknown): number | null {
  const items = parseList(evidence).map((x) => x.toLowerCase());
  if (items.length === 0 || items.some((x) => x.includes("nothing yet"))) return null;
  let score = 55;
  const blob = items.join(" ");
  if (blob.includes("soc 2")) score += 8;
  if (blob.includes("iso 27001")) score += 6;
  if (blob.includes("iso 42001")) score += 6;
  if (blob.includes("pen-test") || blob.includes("pen test")) score += 4;
  if (blob.includes("baa") || blob.includes("dpa")) score += 3;
  return clamp01(Math.min(score, 78));
}

/**
 * Vendor Trust Score (0–100) — same resolution order as Product Profile UI:
 * 1) generated_profile_report.trustScore.overallScore (> 0)
 * 2) attestation.latest_trust_score (> 0) — denormalized from generated_profile_reports
 * 3) formula.vendor_trust_score / report.vendor_trust_score (> 0)
 * 4) default 50 when attestation is missing or score unavailable
 */
export function extractVendorTrustScore(
  attestationRow: Record<string, unknown> | null,
  evidence?: unknown,
): number {
  if (!attestationRow) {
    return vtsFromEvidence(evidence) ?? 50;
  }

  const report =
    attestationRow.generated_profile_report != null &&
    typeof attestationRow.generated_profile_report === "object" &&
    !Array.isArray(attestationRow.generated_profile_report)
      ? (attestationRow.generated_profile_report as Record<string, unknown>)
      : null;

  const trustBlockRaw = report?.trustScore ?? report?.trust_score;
  const trustBlock =
    trustBlockRaw != null && typeof trustBlockRaw === "object" && !Array.isArray(trustBlockRaw)
      ? (trustBlockRaw as Record<string, unknown>)
      : null;

  const fromOverall = Number(trustBlock?.overallScore ?? trustBlock?.overall_score);
  if (Number.isFinite(fromOverall) && fromOverall > 0) {
    return clamp01(Math.round((fromOverall + Number.EPSILON) * 100) / 100);
  }

  const fromLatest = Number(
    attestationRow.latest_trust_score ?? attestationRow.latestTrustScore,
  );
  if (Number.isFinite(fromLatest) && fromLatest > 0) {
    return clamp01(Math.round((fromLatest + Number.EPSILON) * 100) / 100);
  }

  const formula =
    report?.formula != null && typeof report.formula === "object" && !Array.isArray(report.formula)
      ? (report.formula as Record<string, unknown>)
      : null;
  const fromFormula = Number(
    formula?.vendor_trust_score ??
      formula?.formula_vendor_trust_score ??
      report?.vendor_trust_score,
  );
  if (Number.isFinite(fromFormula) && fromFormula > 0) {
    return clamp01(Math.round((fromFormula + Number.EPSILON) * 100) / 100);
  }

  // Explicit 0 only if that is truly all we have
  if (Number.isFinite(fromOverall) && fromOverall === 0) return 0;
  if (Number.isFinite(fromLatest) && fromLatest === 0) return 0;
  return vtsFromEvidence(evidence) ?? 50;
}

function isHighStakes(criticality: string): boolean {
  return (
    criticality.includes("life or death") ||
    criticality.includes("major financial") ||
    criticality.includes("high") ||
    criticality.includes("critical") ||
    criticality.includes("work stops") ||
    criticality.includes("mission")
  );
}

function isLowOrMediumStakes(criticality: string): boolean {
  return (
    criticality.includes("low impact") ||
    criticality.includes("minimal") ||
    criticality.includes("moderate impact") ||
    criticality.includes("medium") ||
    criticality.includes("low") ||
    criticality.includes("work continues") ||
    criticality.includes("additive") ||
    criticality.includes("work degrades")
  );
}

function isAggressiveAppetite(appetite: string): boolean {
  return (
    appetite.includes("aggressive") ||
    appetite.includes("very high") ||
    appetite.startsWith("high")
  );
}

function isConservativeAppetite(appetite: string): boolean {
  return (
    appetite.includes("conservative") ||
    appetite.includes("very low") ||
    appetite.startsWith("low")
  );
}

function digitalFromOnboarding(p: Record<string, unknown>): unknown {
  const skills = norm(p.aiSkillsAvailability);
  const initiatives = norm(firstPresent(p.existingAIInitiatives, p.existingAiInitiatives));
  if (skills.includes("expert") || initiatives.includes("ai-native") || initiatives.includes("extensive")) {
    return "Level 5 - Fully digitized, AI-ready infrastructure";
  }
  if (skills.includes("strong") || skills.includes("moderate")) {
    return "Level 4 - Advanced digital capabilities, data-driven";
  }
  if (skills.includes("limited")) return "Level 2 - Basic digital systems, limited integration";
  if (skills.startsWith("none")) return "Level 1 - Paper-based or minimal digital systems";
  return undefined;
}

function boardFromOnboarding(maturity: unknown): unknown {
  const s = norm(maturity);
  if (!s) return undefined;
  if (s.includes("board") || s.includes("oversight committee") || s.includes("optimized")) {
    return "Yes - Active board with defined responsibilities";
  }
  if (s.startsWith("none")) return "No - Not currently planned";
  return undefined;
}

function ethicsFromOnboarding(maturity: unknown): unknown {
  const s = norm(maturity);
  if (!s) return undefined;
  if (s.startsWith("none")) return "No - Not currently developed";
  if (["documented", "basic", "intermediate", "advanced", "optimized"].some((t) => s.includes(t))) {
    return "Yes - Comprehensive policy actively enforced";
  }
  return undefined;
}

export function resolveBuyerIrsInputs(
  buyerPayload: Record<string, unknown>,
  attestationRow: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const p = buyerPayload;
  const evidence = firstPresent(p.vendorEvidenceReceived, p.vendorCertifications);
  const testing = firstPresent(
    p.testingResultsAvailable,
    attestationGet(attestationRow, "testing_results_available", "testingResultsAvailable"),
  );
  const testingBlob = parseList(evidence).join(" ").toLowerCase();
  const testingFromEvidence =
    /testing results|pen-test|pen test|model or safety/.test(testingBlob)
      ? "Yes - Internal testing results provided"
      : undefined;

  return {
    digitalMaturityLevel: firstPresent(p.digitalMaturityLevel, digitalFromOnboarding(p)),
    dataGovernanceMaturity: firstPresent(p.dataGovernanceMaturity, p.data_governance_maturity),
    aiGovernanceBoard: firstPresent(
      p.aiGovernanceBoard,
      boardFromOnboarding(p.aiGovernanceMaturity),
    ),
    aiEthicsPolicy: firstPresent(p.aiEthicsPolicy, ethicsFromOnboarding(p.aiGovernanceMaturity)),
    implementationCapacity: firstPresent(
      p.implementationCapacity,
      p.implementationTeamComposition,
    ),
    implementationTeamComposition: firstPresent(
      p.implementationTeamComposition,
      p.implementationCapacity,
    ),
    riskAppetite: p.riskAppetite,
    criticality: firstPresent(p.decisionStakes, p.criticality, p.unavailabilityImpact),
    integrationSystems: p.integrationSystems,
    integrationAccessLevels: p.integrationAccessLevels,
    currentUsageState: firstPresent(p.currentUsageState, p.requirementGaps),
    rollbackCapability: firstPresent(
      p.rollbackCapability,
      attestationGet(attestationRow, "rollback_capability", "rollbackCapability"),
    ),
    monitoringDataAvailable: firstPresent(
      p.monitoringDataAvailable,
      attestationGet(attestationRow, "production_model_monitoring"),
    ),
    monitoringDataStance: p.monitoringDataStance,
    auditLogsAvailable: firstPresent(
      p.auditLogsAvailable,
      attestationGet(attestationRow, "audit_logs_available", "auditLogsAvailable"),
    ),
    auditLogsStance: p.auditLogsStance,
    testingResultsAvailable: firstPresent(testing, testingFromEvidence),
    dataSensitivity: p.dataSensitivity,
    humanReviewLevel: p.humanReviewLevel,
    outputExposure: p.outputExposure,
    trainingUseOfData: p.trainingUseOfData,
    trainingUseOfDataStance: p.trainingUseOfDataStance,
    deploymentModel: p.deploymentModel,
    pilotStatus: p.pilotStatus,
    usersInScope: p.usersInScope,
    trainingEffort: p.trainingEffort,
    vendorEvidenceReceived: evidence,
    dataExportCapability: p.dataExportCapability,
    contractsInPlace: p.contractsInPlace,
    answerConfidence: p.answerConfidence,
    accountableOwnerName: p.accountableOwnerName,
    useCaseTypes: p.useCaseTypes,
  };
}

function capacityDelta(resolved: Record<string, unknown>): number {
  const capacity = norm(resolved.implementationCapacity);
  if (capacity.includes("dedicated")) return -6;
  if (capacity.includes("named owner")) return 0;
  if (capacity.includes("shared")) return 6;
  if (capacity.includes("no one assigned") || capacity.includes("no team")) return 8;
  const team = parseList(resolved.implementationTeamComposition).filter(
    (t) => !norm(t).includes("no team") && !norm(t).includes("no one assigned"),
  );
  if (team.length >= 4) return -6;
  if (team.length === 1) return 8;
  if (team.length === 0 && !isEmpty(resolved.accountableOwnerName)) return 0;
  return 0;
}

function calculateOrgReadinessGap(resolved: Record<string, unknown>): number {
  let risk = 35;
  const digital = norm(resolved.digitalMaturityLevel);
  if (
    digital.includes("level 5") ||
    digital.includes("level 4") ||
    digital.includes("high") ||
    digital.includes("advanced")
  ) {
    risk -= 10;
  } else if (digital.includes("level 3") || digital.includes("medium")) {
    risk -= 4;
  } else if (
    digital.includes("level 1") ||
    digital.includes("level 2") ||
    digital.includes("low") ||
    digital.includes("ad-hoc")
  ) {
    risk += 10;
  }

  const governance = norm(resolved.dataGovernanceMaturity);
  if (
    governance.includes("optimized") ||
    governance.includes("managed") ||
    governance.includes("mature") ||
    governance.includes("excellent")
  ) {
    risk -= 8;
  } else if (
    governance.includes("basic") ||
    governance.includes("developing") ||
    governance.includes("defined")
  ) {
    risk += 4;
  } else if (
    governance.includes("ad-hoc") ||
    governance.includes("low") ||
    governance.includes("initial") ||
    governance.startsWith("none")
  ) {
    risk += 10;
  }

  if (!isEmpty(resolved.aiGovernanceBoard) && !boolYes(resolved.aiGovernanceBoard)) risk += 8;
  if (!isEmpty(resolved.aiEthicsPolicy) && !boolYes(resolved.aiEthicsPolicy)) risk += 8;
  risk += capacityDelta(resolved);

  const appetite = norm(resolved.riskAppetite);
  const criticality = norm(resolved.criticality);
  if (isHighStakes(criticality) && isAggressiveAppetite(appetite)) risk += 8;
  if (isLowOrMediumStakes(criticality) && isConservativeAppetite(appetite)) risk -= 2;

  const sensitivity = norm(resolved.dataSensitivity);
  if (sensitivity.includes("extremely") || sensitivity.includes("highly sensitive")) risk += 6;
  else if (sensitivity.includes("sensitive")) risk += 3;

  const review = norm(resolved.humanReviewLevel);
  if (review.includes("no review")) risk += 8;
  else if (review.includes("exception")) risk += 4;
  else if (review.startsWith("always")) risk -= 4;

  const confidence = norm(resolved.answerConfidence);
  if (confidence.startsWith("low")) risk += 4;
  else if (confidence.startsWith("high")) risk -= 2;

  return clamp01(risk);
}

function effectiveAvailable(value: unknown, stance: unknown): boolean {
  if (norm(stance) === "dispute") return false;
  return boolYes(value);
}

function calculateIntegrationRisk(resolved: Record<string, unknown>): number {
  let risk = 25;
  const systems = parseList(resolved.integrationSystems).filter((s) => {
    const n = norm(s);
    return !n.includes("no integration") && n !== "none";
  });
  risk += Math.min(30, systems.length * 6);

  const access = parseList(resolved.integrationAccessLevels).join(" ").toLowerCase();
  if (access.includes("admin") || access.includes("delete")) risk += 6;
  else if (access.includes("write")) risk += 3;

  const usage = norm(resolved.currentUsageState);
  if (usage.includes("officially in use") || usage.startsWith("yes")) risk -= 3;
  else if (usage.includes("trial") || usage.includes("poc")) risk += 4;
  else if (usage.includes("unsanctioned")) risk += 8;
  else if (usage.includes("not in use") || usage.startsWith("no")) risk += 12;

  const rollback = norm(resolved.rollbackCapability);
  if (rollback) {
    if (rollback.startsWith("none") || rollback.includes("no rollback") || rollback === "no") {
      risk += 12;
    } else if (
      rollback.includes("manual") ||
      rollback.startsWith("moderate") ||
      rollback.startsWith("limited")
    ) {
      risk += 6;
    } else {
      risk -= 3;
    }
  } else {
    const exp = norm(resolved.dataExportCapability);
    if (exp.startsWith("no")) risk += 12;
    else if (exp.startsWith("yes")) risk += 6;
  }

  if (!effectiveAvailable(resolved.monitoringDataAvailable, resolved.monitoringDataStance)) risk += 6;
  if (!effectiveAvailable(resolved.auditLogsAvailable, resolved.auditLogsStance)) risk += 6;
  if (!boolYes(resolved.testingResultsAvailable)) risk += 6;

  const exposure = norm(resolved.outputExposure);
  if (exposure.includes("published directly")) risk += 6;
  else if (exposure.includes("customer-facing")) risk += 3;

  const training = norm(resolved.trainingUseOfData);
  if (norm(resolved.trainingUseOfDataStance) === "dispute" || training.startsWith("yes")) risk += 5;
  else if (training.includes("not yet")) risk += 3;

  const deployment = norm(resolved.deploymentModel);
  if (deployment.includes("on-premise") || deployment.includes("private cloud")) risk += 4;

  const pilot = norm(resolved.pilotStatus);
  if (pilot.includes("did not meet")) risk += 6;
  else if (pilot.includes("not planned")) risk += 4;
  else if (pilot.includes("met criteria")) risk -= 4;

  const users = norm(resolved.usersInScope);
  if (users.includes("5,000+") || users.includes("5000+")) risk += 4;
  else if (users.includes("1-10")) risk -= 2;

  if (norm(resolved.trainingEffort).includes("multi-day")) risk += 3;

  const contracts = parseList(resolved.contractsInPlace).map(norm);
  if (contracts.some((c) => c.includes("nothing signed"))) risk += 4;

  if (parseList(resolved.useCaseTypes).some((x) => norm(x).includes("automatically"))) risk += 4;

  return clamp01(risk);
}

function interpret(
  score: number,
): Pick<
  BuyerImplementationRiskScore,
  "grade" | "classification" | "decision" | "recommendedAction" | "readiness_profile"
> {
  const s = Math.max(0, Math.min(100, Number(score)));
  if (s >= 76) {
    return {
      grade: "A",
      classification: "High Readiness",
      decision: "PROCEED",
      readiness_profile:
        "Organization ready; vendor capable; integration straightforward ",
      recommendedAction: "Proceed with standard implementation timeline.",
    };
  }
  if (s >= 51) {
    return {
      grade: "B",
      classification: "Moderate Readiness",
      decision: "PROCEED WITH CAUTION",
      readiness_profile: "Some gaps exist; manageable with planning",
      recommendedAction: "Proceed with gap mitigation plan; extend timeline 20-30%.",
    };
  }
  if (s >= 26) {
    return {
      grade: "C",
      classification: "Low Readiness",
      decision: "PROCEED WITH CAUTION",
      readiness_profile: "Significant gaps; risk of failure if not addressed.",
      recommendedAction: "Proceed with caution; extend timeline 50-100%; pilot first.",
    };
  }
  return {
    grade: "D",
    classification: "Readiness Review Required",
    decision: "DO NOT PROCEED",
    readiness_profile: "Major gaps across dimensions; additional preparation needed",
    recommendedAction: "Do not proceed until critical gaps are resolved; reassess after remediation.",
  };
}

/** Letter grade for a stored IRS (0–100). Bands use the two-decimal score as stored. */
export function buyerImplementationReadinessGradeFromScore(rawScore: number): "A" | "B" | "C" | "D" {
  return interpret(rawScore).grade;
}

function roundDigits(n: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/** Canonical IRS from breakdown parts.
 * Pillar values stay at calculation precision. Only the headline score is rounded to 2 decimals.
 * Optional intentMultiplier (default 1.0) scales the composite risk term when RI intent is present.
 */
export function irsFinalScoreFromParts(
  vendorRisk: number,
  orgGap: number,
  integrationRisk: number,
  intentMultiplier = 1.0,
): { score: number; vendorRisk: number; orgGap: number; integrationRisk: number } {
  const vr = clamp01(vendorRisk);
  const org = clamp01(orgGap);
  const integ = clamp01(integrationRisk);
  const intent =
    Number.isFinite(intentMultiplier) && intentMultiplier > 0
      ? Math.min(1.5, Math.max(0.5, intentMultiplier))
      : 1.0;
  const weighted = 100 - (vr * 0.35 + org * 0.35 + integ * 0.3) * intent;
  const score = roundDigits(clamp01(weighted), 2);
  return {
    score,
    vendorRisk: roundDigits(vr, 4),
    orgGap: roundDigits(org, 4),
    integrationRisk: roundDigits(integ, 4),
  };
}

export function calculateBuyerImplementationRiskScore(
  buyerPayload: Record<string, unknown>,
  attestationRow: Record<string, unknown> | null,
  vendorName: string,
  productName: string,
): BuyerImplementationRiskScore {
  const resolved = resolveBuyerIrsInputs(buyerPayload, attestationRow);
  const vendorTrustScore =
    Math.round(extractVendorTrustScore(attestationRow, resolved.vendorEvidenceReceived) * 100) / 100;
  const parts = irsFinalScoreFromParts(
    clamp01(100 - vendorTrustScore),
    calculateOrgReadinessGap(resolved),
    calculateIntegrationRisk(resolved),
  );
  const interpreted = interpret(parts.score);

  return {
    implementationRiskScore: parts.score,
    ...interpreted,
    formula: "IRS = 100 - ((Vendor_Risk × 0.35) + (Organizational_Readiness_Gap × 0.35) + (Integration_Risk × 0.30))",
    breakdown: {
      vendorRisk: parts.vendorRisk,
      organizationalReadinessGap: parts.orgGap,
      integrationRisk: parts.integrationRisk,
      vendorTrustScore,
    },
    source: {
      vendorName: vendorName || "Vendor",
      productName: productName || "Product",
      usedAttestation: attestationRow != null,
    },
  };
}
