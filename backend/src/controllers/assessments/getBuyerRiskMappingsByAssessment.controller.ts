import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";
import { getTop5RisksWithMitigations } from "../../services/getTop5RisksFromAssessmentContext.js";

type FrameworkMappingRow = {
  framework?: unknown;
  coverage?: unknown;
  controls?: unknown;
  notes?: unknown;
};

function frameworkMappingRowsFromReport(rawReport: unknown): FrameworkMappingRow[] {
  if (!rawReport || typeof rawReport !== "object") return [];
  const reportObj = rawReport as Record<string, unknown>;
  const top = reportObj.frameworkMapping as { rows?: FrameworkMappingRow[] } | undefined;
  if (Array.isArray(top?.rows)) return top.rows;
  const generated = reportObj.generatedAnalysis as { fullReport?: Record<string, unknown> } | undefined;
  const nested = generated?.fullReport?.frameworkMapping as { rows?: FrameworkMappingRow[] } | undefined;
  return Array.isArray(nested?.rows) ? nested.rows : [];
}

function buildBuyerPayloadForRiskDb(row: {
  industry_sector: string | null;
  business_outcomes: string | null;
  target_timeline: string | null;
  pain_point: string | null;
  identified_risks: string | null;
  risk_domain_scores: string | null;
  regulatory_requirments: unknown;
  risk_mitigation_mapping_ids: unknown;
}): Record<string, unknown> {
  return {
    industrySector: row.industry_sector,
    expectedOutcomes: row.business_outcomes,
    targetTimeline: row.target_timeline,
    businessPainPoint: row.pain_point,
    identifiedRisks: row.identified_risks,
    riskDomainScores: row.risk_domain_scores,
    regulatoryRequirements: row.regulatory_requirments,
    riskMitigationMappingIds: row.risk_mitigation_mapping_ids,
  };
}

/** GET /buyerCotsAssessment/:id/risk-mappings - DB matched top risks + mitigations for selected buyer assessment. */
const getBuyerRiskMappingsByAssessment = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.user as { id?: number } | undefined;
    const userId = payload?.id;
    if (userId == null) {
      res.status(401).json({ success: false, message: "User not authenticated" });
      return;
    }

    const assessmentId = typeof req.params?.id === "string" ? req.params.id.trim() : "";
    if (!assessmentId) {
      res.status(400).json({ success: false, message: "assessmentId is required" });
      return;
    }

    const [user] = await db
      .select({ organization_id: usersTable.organization_id })
      .from(usersTable)
      .where(eq(usersTable.id, Number(userId)))
      .limit(1);
    const orgId = user?.organization_id != null ? String(user.organization_id).trim() : "";
    if (!orgId) {
      res.status(403).json({ success: false, message: "User has no organization" });
      return;
    }

    const [aRow] = await db
      .select({ id: assessments.id, type: assessments.type })
      .from(assessments)
      .where(and(eq(assessments.id, assessmentId), eq(assessments.organization_id, orgId)))
      .limit(1);
    if (!aRow || String(aRow.type ?? "").toLowerCase() !== "cots_buyer") {
      res.status(404).json({ success: false, message: "Buyer assessment not found or access denied" });
      return;
    }

    const [cotsRow] = await db
      .select({
        industry_sector: cotsBuyerAssessments.industry_sector,
        business_outcomes: cotsBuyerAssessments.business_outcomes,
        target_timeline: cotsBuyerAssessments.target_timeline,
        pain_point: cotsBuyerAssessments.pain_point,
        identified_risks: cotsBuyerAssessments.identified_risks,
        risk_domain_scores: cotsBuyerAssessments.risk_domain_scores,
        regulatory_requirments: cotsBuyerAssessments.regulatory_requirments,
        risk_mitigation_mapping_ids: cotsBuyerAssessments.risk_mitigation_mapping_ids,
        vendor_risk_assessment_report: cotsBuyerAssessments.vendor_risk_assessment_report,
      })
      .from(cotsBuyerAssessments)
      .where(eq(cotsBuyerAssessments.assessment_id, assessmentId))
      .limit(1);

    if (!cotsRow) {
      res.status(404).json({ success: false, message: "Buyer assessment data not found" });
      return;
    }

    const riskPayload = buildBuyerPayloadForRiskDb(cotsRow);
    const top5 = await getTop5RisksWithMitigations(riskPayload);
    const frameworkMappingRows = frameworkMappingRowsFromReport(cotsRow.vendor_risk_assessment_report);

    res.status(200).json({
      success: true,
      data: {
        assessmentId,
        top5Risks: top5.top5Risks,
        mitigationsByRiskId: top5.mitigationsByRiskId,
        frameworkMappingRows,
      },
    });
  } catch (err) {
    console.error("getBuyerRiskMappingsByAssessment error:", err);
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Failed to fetch risk mappings",
    });
  }
};

export default getBuyerRiskMappingsByAssessment;

