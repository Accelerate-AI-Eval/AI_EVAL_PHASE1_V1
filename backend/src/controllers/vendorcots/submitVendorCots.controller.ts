import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { eq, and, or } from "drizzle-orm";
import { generateVendorCotsReport } from "../agents/vendorCotsReportAgent.js";
import {
  getTop5RisksWithMitigations,
  type Top5RisksWithMitigations,
} from "../../services/getTop5RisksFromAssessmentContext.js";

/** Persisted under fullReport.appendix: catalog rows used to generate the assessment. */
function appendixCatalogRisksAndMitigations(
  top5: Top5RisksWithMitigations | null,
): Array<{
  risk_id: string;
  risk_domain?: string;
  risk_title?: string;
  mitigation_action_names: string[];
}> | undefined {
  if (!top5?.top5Risks?.length) return undefined;
  const items: Array<{
    risk_id: string;
    risk_domain?: string;
    risk_title?: string;
    mitigation_action_names: string[];
  }> = [];
  for (const r of top5.top5Risks) {
    const rid = String(r.risk_id ?? "").trim();
    if (!rid) continue;
    const mids = top5.mitigationsByRiskId[rid] ?? [];
    const names = [
      ...new Set(
        mids
          .map((m) => String(m.mitigation_action_name ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const riskDomain = String(r.domains ?? "").trim();
    const riskTitle = String(r.risk_title ?? "").trim();
    items.push({
      risk_id: rid,
      ...(riskDomain ? { risk_domain: riskDomain } : {}),
      ...(riskTitle ? { risk_title: riskTitle } : {}),
      mitigation_action_names: names,
    });
  }
  return items.length ? items : undefined;
}
/** Persisted under fullReport.appendix: flat rows for report appendix table (risk id, domain, mitigation id + name). */
function appendixRiskMitigationActions(
  top5: Top5RisksWithMitigations | null,
): Array<{
  risk_id: string;
  risk_domain?: string;
  risk_title?: string;
  mitigation_action_id: string;
  mitigation_action_name: string;
}> | undefined {
  if (!top5?.top5Risks?.length) return undefined;
  const items: Array<{
    risk_id: string;
    risk_domain?: string;
    risk_title?: string;
    mitigation_action_id: string;
    mitigation_action_name: string;
  }> = [];
  for (const r of top5.top5Risks) {
    const rid = String(r.risk_id ?? "").trim();
    if (!rid) continue;
    const riskDomain = String(r.domains ?? "").trim();
    const riskTitle = String(r.risk_title ?? "").trim();
    const mids = top5.mitigationsByRiskId[rid] ?? [];
    for (const m of mids) {
      const name = String(m.mitigation_action_name ?? "").trim();
      if (!name) continue;
      const mid = String(m.mitigation_action_id ?? "").trim();
      items.push({
        risk_id: rid,
        ...(riskDomain ? { risk_domain: riskDomain } : {}),
        ...(riskTitle ? { risk_title: riskTitle } : {}),
        mitigation_action_id: mid,
        mitigation_action_name: name,
      });
    }
  }
  return items.length ? items : undefined;
}
import { calculateRoiFromAssessment } from "../../services/roiCalculator.js";

/** Fixed appendix text for all reports; only reviewedBy is set from the user who submitted. */
const APPENDIX_METHODOLOGY = "AI EVAL 3-Layer Risk Assessment Framework v2.1 — Customer-Specific Analysis";
const APPENDIX_PREPARED_BY = "AI EVAL Platform — Automated Analysis Report Engine";
const APPENDIX_CONFIDENTIALITY = "Confidential — For internal sales team use only";

/** POST /vendorCotsAssessment - submit: create or update assessment. Save draft = status "draft", Submit = status "submitted" (DB enum has draft/submitted). */
async function createCustomerRiskReport(
  assessmentId: string,
  orgIdStr: string,
  payloadCots: Record<string, unknown>,
  reviewedByUser: string,
): Promise<void> {
  const vendorAttestationId = payloadCots.vendor_attestation_id != null ? String(payloadCots.vendor_attestation_id).trim() : null;
  let productName = "";
  if (vendorAttestationId) {
    const [row] = await db
      .select({ product_name: vendorSelfAttestations.product_name })
      .from(vendorSelfAttestations)
      .where(
        or(
          eq(vendorSelfAttestations.id, vendorAttestationId),
          eq(vendorSelfAttestations.vendor_self_attestation_id, vendorAttestationId),
        ),
      )
      .limit(1);
    productName = (row?.product_name ?? "").trim() || "Product";
  } else {
    productName = "Product";
  }
  const orgName = (payloadCots.customer_organization_name != null ? String(payloadCots.customer_organization_name).trim() : "") || "Organization";
  const title = `Analysis Report: ${orgName} - ${productName}`;
  const toJson = (v: unknown) =>
    v != null ? (Array.isArray(v) ? v : typeof v === "object" ? JSON.stringify(v) : String(v)) : "";
  const report: Record<string, unknown> = {
    assessmentId,
    status: "submitted",
    organizationId: orgIdStr,
    selectedProductId: vendorAttestationId ?? "",
    customerOrganizationName: payloadCots.customer_organization_name ?? "",
    customerSector: payloadCots.customer_sector ?? "",
    primaryPainPoint: payloadCots.primary_pain_point ?? "",
    expectedOutcomes: payloadCots.expected_outcomes ?? "",
    customerBudgetRange: payloadCots.customer_budget_range ?? "",
    implementationTimeline: payloadCots.implementation_timeline ?? "",
    productFeatures:
      payloadCots.product_features != null
        ? Array.isArray(payloadCots.product_features)
          ? payloadCots.product_features
          : toJson(payloadCots.product_features)
        : "",
    implementationApproach: payloadCots.implementation_approach ?? "",
    customizationLevel: payloadCots.customization_level ?? "",
    integrationComplexity: payloadCots.integration_complexity ?? "",
    regulatoryRequirements:
      payloadCots.regulatory_requirements != null
        ? Array.isArray(payloadCots.regulatory_requirements)
          ? payloadCots.regulatory_requirements
          : toJson(payloadCots.regulatory_requirements)
        : "",
    regulatoryRequirementsOther: payloadCots.regulatory_requirements_other ?? "",
    dataSensitivity: payloadCots.data_sensitivity ?? "",
    customerRiskTolerance: payloadCots.customer_risk_tolerance ?? "",
    alternativesConsidered: payloadCots.alternatives_considered ?? "",
    keyAdvantages: payloadCots.key_advantages ?? "",
    customerSpecificRisks:
      payloadCots.customer_specific_risks != null
        ? Array.isArray(payloadCots.customer_specific_risks)
          ? payloadCots.customer_specific_risks
          : toJson(payloadCots.customer_specific_risks)
        : "",
    customerSpecificRisksOther: payloadCots.customer_specific_risks_other ?? "",
    identifiedRisks: payloadCots.identified_risks ?? "",
    riskDomainScores: payloadCots.risk_domain_scores ?? "",
    contextualMultipliers: payloadCots.contextual_multipliers ?? "",
    riskMitigation: payloadCots.risk_mitigation ?? "",
  };

  let top5RisksWithMitigations: Awaited<ReturnType<typeof getTop5RisksWithMitigations>> | null = null;
  try {
    top5RisksWithMitigations = await getTop5RisksWithMitigations(payloadCots);
  } catch (err) {
    console.error("getTop5RisksWithMitigations failed:", err);
  }

  if (top5RisksWithMitigations) {
    report.dbTop5Risks = {
      top5Risks: top5RisksWithMitigations.top5Risks.map((r) => ({
        risk_id: r.risk_id,
      })),
      mitigationsByRiskId: Object.fromEntries(
        Object.entries(top5RisksWithMitigations.mitigationsByRiskId).map(([rid, list]) => [
          rid,
          list.map((m) => ({ mitigation_action_id: m.mitigation_action_id })),
        ]),
      ),
    };
  }

  report.deploymentOverview = {
    useCase: payloadCots.expected_outcomes ?? payloadCots.primary_pain_point ?? "",
    productTier: productName,
    targetUsers: "",
    infrastructure: payloadCots.integration_complexity ?? "",
    deploymentTimeline: payloadCots.implementation_timeline ?? "",
    annualContractValue: payloadCots.customer_budget_range ?? "",
  };

  const generated = await generateVendorCotsReport(payloadCots, top5RisksWithMitigations);
  if (generated) {
    if (
      generated.matchedRiskSummaries &&
      generated.matchedRiskSummaries.length > 0 &&
      report.dbTop5Risks != null &&
      typeof report.dbTop5Risks === "object"
    ) {
      const dbTop = report.dbTop5Risks as {
        top5Risks?: Array<Record<string, unknown>>;
        mitigationsByRiskId?: unknown;
      };
      const rows = dbTop.top5Risks;
      if (Array.isArray(rows)) {
        const byId = new Map(
          generated.matchedRiskSummaries.map((m) => [
            String(m.risk_id ?? "").trim(),
            m.summary_points,
          ] as const),
        );
        dbTop.top5Risks = rows.map((r) => {
          const rid = String(r.risk_id ?? "").trim();
          const pts = rid ? byId.get(rid) : undefined;
          if (pts && pts.length > 0) {
            return { ...r, summary_points: pts };
          }
          return r;
        });
      }
    }

    if (
      generated.matchedMitigationSummaries &&
      generated.matchedMitigationSummaries.length > 0 &&
      report.dbTop5Risks != null &&
      typeof report.dbTop5Risks === "object"
    ) {
      const dbTop = report.dbTop5Risks as {
        top5Risks?: Array<Record<string, unknown>>;
        mitigationsByRiskId?: Record<string, Array<Record<string, unknown>>>;
      };
      const mitMap = dbTop.mitigationsByRiskId;
      if (mitMap && typeof mitMap === "object") {
        const mitigationIdByRiskAndName = new Map<string, string>();
        if (top5RisksWithMitigations?.mitigationsByRiskId) {
          for (const [rid, mids] of Object.entries(top5RisksWithMitigations.mitigationsByRiskId)) {
            for (const m of mids) {
              const key = `${rid}::${String(m.mitigation_action_name ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
              mitigationIdByRiskAndName.set(key, String(m.mitigation_action_id ?? "").trim());
            }
          }
        }
        const normName = (s: string) =>
          String(s ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
        for (const entry of generated.matchedMitigationSummaries) {
          const rid = String(entry.risk_id ?? "").trim();
          const wantName = String(entry.mitigation_action_name ?? "").trim();
          const pts = entry.summary_points?.filter((p) => String(p ?? "").trim().length > 1) ?? [];
          if (!rid || !wantName || pts.length === 0) continue;
          const mitigationId = mitigationIdByRiskAndName.get(`${rid}::${normName(wantName)}`) ?? "";
          if (!mitigationId) continue;
          const list = mitMap[rid];
          if (!Array.isArray(list)) continue;
          const idx = list.findIndex(
            (m) => String(m.mitigation_action_id ?? "").trim() === mitigationId,
          );
          if (idx >= 0) {
            list[idx] = { ...list[idx], mitigation_summary_points: pts };
          }
        }
        dbTop.mitigationsByRiskId = mitMap;
      }
    }

    const fullReport = generated.fullReport as Record<string, unknown> | undefined;
    const appendix = (fullReport?.appendix && typeof fullReport.appendix === "object")
      ? (fullReport.appendix as Record<string, unknown>)
      : {};
    const calculatedRoi = calculateRoiFromAssessment(payloadCots);
    report.generatedAnalysis = {
      overallRiskScore: generated.overallRiskScore,
      riskLevel: generated.riskLevel,
      summary: generated.summary,
      executiveSummary: generated.executiveSummary,
      keyRisks: generated.keyRisks,
      recommendations: generated.recommendations,
      recommendationsWithPriority: generated.recommendationsWithPriority,
      fullReport: {
        ...fullReport,
        roiAnalysis: calculatedRoi,
        appendix: {
          ...appendix,
          methodology: APPENDIX_METHODOLOGY,
          preparedBy: APPENDIX_PREPARED_BY,
          reviewedBy: reviewedByUser.trim() || "—",
          confidentiality: APPENDIX_CONFIDENTIALITY,
          dataSources: Array.isArray(appendix.dataSources) ? appendix.dataSources : undefined,
          catalogRisksAndMitigations: appendixCatalogRisksAndMitigations(top5RisksWithMitigations),
          catalogRiskMitigationActions: appendixRiskMitigationActions(top5RisksWithMitigations),
        },
      },
    };
  }

  await db.insert(customerRiskAssessmentReports).values({
    assessment_id: assessmentId,
    organization_id: orgIdStr,
    title,
    report,
  });
}

const submitVendorCotsAssessment = async (req: Request, res: Response) => {
  try {
    const decoded = req.user as { id?: number } | undefined;
    const userId = decoded?.id;
    if (userId == null) {
      return res.status(401).json({ message: "User not found from token" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(userId)))
      .limit(1);
    if (!user) return res.status(404).json({ message: "User not found" });
    const orgIdFromUser = (user as Record<string, unknown>).organization_id;
    const orgIdStr = orgIdFromUser != null ? String(orgIdFromUser).trim() : "";
    if (!orgIdStr) {
      return res.status(400).json({ message: "User has no organization. Complete onboarding or contact admin." });
    }

    const u = user as Record<string, unknown>;
    const firstName = typeof u.user_first_name === "string" ? u.user_first_name.trim() : "";
    const lastName = typeof u.user_last_name === "string" ? u.user_last_name.trim() : "";
    const userName = typeof u.user_name === "string" ? u.user_name.trim() : "";
    const email = typeof u.email === "string" ? u.email.trim() : "";
    const reviewedByUser =
      [firstName, lastName].filter(Boolean).join(" ") || userName || email || "—";

    const body = req.body ?? {};
    const get = (key: string) => body[key] ?? body[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
    const parseJson = (v: unknown): unknown => {
      if (v == null) return null;
      if (typeof v === "string" && v.trim().length > 0) {
        try {
          const parsed = JSON.parse(v);
          return parsed;
        } catch {
          return v;
        }
      }
      return v;
    };

    const payloadCots = {
      vendor_attestation_id: get("selectedProductId") != null && String(get("selectedProductId")).trim() !== "" ? String(get("selectedProductId")).trim() : null,
      customer_organization_name: get("customerOrganizationName") != null ? String(get("customerOrganizationName")).slice(0, 200) : null,
      customer_sector: get("customerSector") != null ? String(get("customerSector")).slice(0, 200) : null,
      primary_pain_point: get("primaryPainPoint") != null ? String(get("primaryPainPoint")) : null,
      expected_outcomes: get("expectedOutcomes") != null ? String(get("expectedOutcomes")).slice(0, 300) : null,
      customer_budget_range: get("customerBudgetRange") != null ? String(get("customerBudgetRange")).slice(0, 100) : null,
      implementation_timeline: get("implementationTimeline") != null ? String(get("implementationTimeline")).slice(0, 100) : null,
      product_features: parseJson(get("productFeatures") ?? get("product_features")),
      implementation_approach: get("implementationApproach") != null ? String(get("implementationApproach")).slice(0, 100) : null,
      customization_level: get("customizationLevel") != null ? String(get("customizationLevel")).slice(0, 100) : null,
      integration_complexity: get("integrationComplexity") != null ? String(get("integrationComplexity")).slice(0, 100) : null,
      regulatory_requirements: parseJson(get("regulatoryRequirements") ?? get("regulatory_requirements")),
      regulatory_requirements_other: get("regulatoryRequirementsOther") != null ? String(get("regulatoryRequirementsOther")).slice(0, 300) : null,
      data_sensitivity: get("dataSensitivity") != null ? String(get("dataSensitivity")).slice(0, 100) : null,
      customer_risk_tolerance: get("customerRiskTolerance") != null ? String(get("customerRiskTolerance")).slice(0, 100) : null,
      alternatives_considered: get("alternativesConsidered") != null ? String(get("alternativesConsidered")) : null,
      key_advantages: get("keyAdvantages") != null ? String(get("keyAdvantages")) : null,
      customer_specific_risks: parseJson(get("customerSpecificRisks") ?? get("customer_specific_risks")),
      customer_specific_risks_other: get("customerSpecificRisksOther") != null ? String(get("customerSpecificRisksOther")).slice(0, 300) : null,
      identified_risks: get("identifiedRisks") != null ? String(get("identifiedRisks")) : null,
      risk_domain_scores: get("riskDomainScores") != null ? String(get("riskDomainScores")) : null,
      contextual_multipliers: get("contextualMultipliers") != null ? String(get("contextualMultipliers")) : null,
      risk_mitigation: get("riskMitigation") != null ? String(get("riskMitigation")) : null,
    };

    const assessmentIdRaw = body.assessmentId ?? body.assessment_id;
    const assessmentId = typeof assessmentIdRaw === "string" ? assessmentIdRaw.trim() || null : null;

    if (assessmentId) {
      const [existing] = await db
        .select({ id: assessments.id, status: assessments.status })
        .from(assessments)
        .where(
          and(
            eq(assessments.id, assessmentId),
            eq(assessments.organization_id, orgIdStr),
            eq(assessments.type, "cots_vendor")
          )
        )
        .limit(1);
      if (existing) {
        const currentStatus = String((existing as { status?: string }).status ?? "").toLowerCase();
        if (currentStatus === "completed" || currentStatus === "submitted") {
          return res.status(403).json({
            message: "Completed assessments cannot be modified.",
          });
        }
        await db.transaction(async (tx) => {
          await tx
            .update(assessments)
            .set({ status: "submitted", updated_at: new Date() })
            .where(eq(assessments.id, assessmentId));
          await tx
            .update(cotsVendorAssessments)
            .set({ ...payloadCots, user_id: Number(userId), updated_at: new Date() })
            .where(eq(cotsVendorAssessments.assessment_id, assessmentId));
        });
        await createCustomerRiskReport(assessmentId, orgIdStr, payloadCots, reviewedByUser);
        return res.status(200).json({
          message: "Vendor COTS assessment submitted successfully",
          assessmentId,
        });
      }
    }

    const [assessment] = await db.transaction(async (tx) => {
      const [a] = await tx
        .insert(assessments)
        .values({
          type: "cots_vendor",
          organization_id: orgIdStr,
          status: "submitted",
        })
        .returning({ id: assessments.id });

      if (!a?.id) {
        throw new Error("Failed to create assessment");
      }

      await tx.insert(cotsVendorAssessments).values({
        assessment_id: a.id,
        user_id: Number(userId),
        ...payloadCots,
      });

      return [a];
    });

    await createCustomerRiskReport(assessment.id, orgIdStr, payloadCots, reviewedByUser);

    return res.status(201).json({
      message: "Vendor COTS assessment submitted successfully",
      assessmentId: assessment.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in submitVendorCotsAssessment:", message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export default submitVendorCotsAssessment;
