type Breakdown = {
  vendorRisk: number;
  organizationalReadinessGap: number;
  integrationRisk: number;
  vendorTrustScore: number;
};

export type BuyerImplementationRiskScore = {
  implementationRiskScore: number;
  classification: "Low-Medium Risk" | "High Risk" | "Critical Risk";
  decision: "PROCEED" | "PROCEED WITH CAUTION" | "DO NOT PROCEED";
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
  const s = norm(v);
  return s === "yes" || s === "true" || s === "available" || s === "exists" || s === "defined";
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // no-op
    }
    return t.split(/,|;|\r?\n/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function extractVendorTrustScore(attestationRow: Record<string, unknown> | null): number {
  if (!attestationRow) return 50;
  const report = attestationRow.generated_profile_report as Record<string, unknown> | undefined;
  const trustScore = report?.trustScore as Record<string, unknown> | undefined;
  const raw =
    trustScore?.overallScore ??
    (report?.formula as Record<string, unknown> | undefined)?.vendor_trust_score ??
    report?.vendor_trust_score;
  const n = Number(raw);
  return clamp01(Number.isFinite(n) ? n : 50);
}

function calculateOrgReadinessGap(buyerPayload: Record<string, unknown>): number {
  let risk = 35;
  const digital = norm(buyerPayload.digitalMaturityLevel);
  if (digital.includes("high") || digital.includes("advanced")) risk -= 10;
  else if (digital.includes("medium")) risk -= 4;
  else if (digital.includes("low") || digital.includes("ad-hoc")) risk += 10;

  const governance = norm(buyerPayload.dataGovernanceMaturity);
  if (governance.includes("optimized") || governance.includes("managed")) risk -= 8;
  else if (governance.includes("basic")) risk += 4;
  else if (governance.includes("ad-hoc") || governance.includes("low")) risk += 10;

  if (!boolYes(buyerPayload.aiGovernanceBoard)) risk += 8;
  if (!boolYes(buyerPayload.aiEthicsPolicy)) risk += 8;

  const team = parseList(buyerPayload.implementationTeamComposition);
  if (team.length >= 4) risk -= 6;
  else if (team.length <= 1) risk += 8;

  const appetite = norm(buyerPayload.riskAppetite);
  const criticality = norm(buyerPayload.criticality);
  if ((criticality.includes("high") || criticality.includes("critical")) && appetite.includes("aggressive")) {
    risk += 8;
  }
  if ((criticality.includes("low") || criticality.includes("medium")) && appetite.includes("conservative")) {
    risk -= 2;
  }
  return clamp01(risk);
}

function calculateIntegrationRisk(buyerPayload: Record<string, unknown>): number {
  let risk = 25;
  const systems = parseList(buyerPayload.integrationSystems);
  risk += Math.min(30, systems.length * 6);

  const gaps = String(buyerPayload.requirementGaps ?? "").trim();
  if (gaps.length > 0) risk += 12;

  const rollback = norm(buyerPayload.rollbackCapability);
  if (rollback.includes("no")) risk += 12;
  else if (rollback.includes("manual")) risk += 6;
  else risk -= 3;

  if (!boolYes(buyerPayload.monitoringDataAvailable)) risk += 6;
  if (!boolYes(buyerPayload.auditLogsAvailable)) risk += 6;
  if (!boolYes(buyerPayload.testingResultsAvailable)) risk += 6;
  return clamp01(risk);
}

function interpret(score: number): Pick<BuyerImplementationRiskScore, "classification" | "decision" | "recommendedAction"> {
  if (score < 50) {
    return {
      classification: "Low-Medium Risk",
      decision: "PROCEED",
      recommendedAction: "Proceed with standard implementation timeline.",
    };
  }
  if (score < 75) {
    return {
      classification: "High Risk",
      decision: "PROCEED WITH CAUTION",
      recommendedAction: "Proceed with a mitigation plan and pilot-first rollout.",
    };
  }
  return {
    classification: "Critical Risk",
    decision: "DO NOT PROCEED",
    recommendedAction: "Do not proceed until critical gaps are remediated.",
  };
}

export function calculateBuyerImplementationRiskScore(
  buyerPayload: Record<string, unknown>,
  attestationRow: Record<string, unknown> | null,
  vendorName: string,
  productName: string,
): BuyerImplementationRiskScore {
  const vendorTrustScore = extractVendorTrustScore(attestationRow);
  const vendorRisk = clamp01(100 - vendorTrustScore);
  const organizationalReadinessGap = calculateOrgReadinessGap(buyerPayload);
  const integrationRisk = calculateIntegrationRisk(buyerPayload);
  const weighted = vendorRisk * 0.35 + organizationalReadinessGap * 0.35 + integrationRisk * 0.3;
  const implementationRiskScore = Number(clamp01(weighted).toFixed(2));
  const interpreted = interpret(implementationRiskScore);

console.log("weighted",weighted)
console.log("implementationRiskScore",implementationRiskScore)
console.log("interpreted",interpreted)

  return {
    implementationRiskScore,
    ...interpreted,
    formula: "IRS = (Vendor_Risk × 0.35) + (Organizational_Readiness_Gap × 0.35) + (Integration_Risk × 0.30)",
    breakdown: {
      vendorRisk,
      organizationalReadinessGap,
      integrationRisk,
      vendorTrustScore,
    },
    source: {
      vendorName: vendorName || "Vendor",
      productName: productName || "Product",
      usedAttestation: attestationRow != null,
    },
  };
}
