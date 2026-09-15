import { eq } from "drizzle-orm";
import { db } from "../database/db.js";
import { buyerOnboarding } from "../schema/buyer/addBuyer.schema.js";

function empty(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return String(v).trim() === "";
}

function fill(target: Record<string, unknown>, key: string, value: unknown): void {
  if (empty(target[key]) && !empty(value)) target[key] = value;
}

/**
 * Map V2 Buyer COTS answers (and buyer onboarding when the form no longer
 * collects a scoring input) onto the keys the IRS formula expects.
 */
export function applyBuyerCotsScoringAliases(
  buyerPayload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...buyerPayload };

  fill(out, "criticality", out.decisionStakes ?? out.unavailabilityImpact);
  fill(out, "requirementGaps", out.currentUsageState);
  fill(out, "implementationTeamComposition", out.implementationCapacity);
  fill(out, "vendorCertifications", out.vendorEvidenceReceived);
  fill(out, "techStack", out.cloudProvider);
  fill(out, "pilotRolloutPlan", out.pilotStatus);
  fill(out, "impactedStakeholders", out.decisionDomains);

  return out;
}

export async function enrichBuyerCotsScoringPayload(
  buyerPayload: Record<string, unknown>,
  organizationId?: string | null,
): Promise<Record<string, unknown>> {
  const out = applyBuyerCotsScoringAliases(buyerPayload);
  const orgId = String(organizationId ?? out.organizationId ?? out.organization_id ?? "").trim();
  if (!orgId) return out;

  try {
    const [row] = await db
      .select()
      .from(buyerOnboarding)
      .where(eq(buyerOnboarding.organizationId, orgId))
      .limit(1);
    if (!row) return out;

    fill(out, "dataGovernanceMaturity", row.dataGovernanceMaturity);
    fill(out, "aiGovernanceMaturity", row.aiGovernanceMaturity);
    fill(out, "aiSkillsAvailability", row.aiSkillsAvailability);
    fill(out, "existingAIInitiatives", row.existingAIInitiatives);
    fill(out, "changeManagementCapability", row.changeManagementCapability);
    fill(out, "regulatoryPenaltyExposure", row.regulatoryPenaltyExposure);
    fill(out, "industrySector", out.industrySector ?? row.sector);
    fill(out, "existingTechnologyStack", out.existingTechnologyStack ?? row.existingTechStack);
    fill(out, "riskAppetite", out.riskAppetite ?? row.aiRiskAppetite);
    fill(out, "employeeCount", out.employeeCount ?? row.employeeCount);
    return out;
  } catch (err) {
    console.error("enrichBuyerCotsScoringPayload: failed to load buyer onboarding", err);
    return out;
  }
}
