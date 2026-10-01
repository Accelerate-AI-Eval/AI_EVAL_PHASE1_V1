import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { createOrganization } from "../../schema/organizations/createOrganization.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { generatedProfileReports } from "../../schema/assessments/generatedProfileReports.js";
import { usersTable } from "../../schema/schema.js";
import { desc, eq, or } from "drizzle-orm";
import {
  buildVtsRationaleFromReport,
  isExplainedVtsRationale,
} from "../../utils/buildVtsRationaleFromReport.js";
import { clampScore2 } from "../../utils/roundScore.js";

function userDisplayName(u: { user_name?: string | null; user_first_name?: string | null; user_last_name?: string | null; email?: string | null }): string {
  const name = (u.user_name ?? "").trim();
  if (name) return name;
  const first = (u.user_first_name ?? "").trim();
  const last = (u.user_last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  return (u.email ?? "").trim() || "—";
}

/** Trust score 0–100 from denormalized column or embedded report JSON. */
function resolveTrustScore(
  latest: number | null | undefined,
  report: unknown,
): number | null {
  if (latest != null && Number.isFinite(Number(latest))) {
    return clampScore2(Number(latest));
  }
  if (report == null || typeof report !== "object") return null;
  const ts = (report as Record<string, unknown>).trustScore;
  if (ts != null && typeof ts === "object") {
    const overall = (ts as Record<string, unknown>).overallScore;
    if (overall != null && Number.isFinite(Number(overall))) {
      return clampScore2(Number(overall));
    }
  }
  const flat = (report as Record<string, unknown>).trust_score;
  if (flat != null && Number.isFinite(Number(flat))) {
    return clampScore2(Number(flat));
  }
  return null;
}

/** VTS rationale: prefer EXPLAINED block, rebuild from structured VTS fields, then legacy fallbacks. */
function resolveVtsRationale(
  report: unknown,
  summaryCol?: string | null,
  scoreRationaleCol?: string | null,
  vtsSource?: {
    trustScore?: number | null;
    grade?: string | null;
    classification?: string | null;
    productRisk?: number | null;
    governanceRisk?: number | null;
    operationalRisk?: number | null;
    formulaDetail?: unknown;
  },
): string | null {
  const storedCandidates = [
    typeof scoreRationaleCol === "string" ? scoreRationaleCol.trim() : "",
    (() => {
      if (report == null || typeof report !== "object") return "";
      const r = report as Record<string, unknown>;
      const top = r.scoreRationale ?? r.score_rationale;
      return typeof top === "string" ? top.trim() : "";
    })(),
    (() => {
      if (report == null || typeof report !== "object") return "";
      const ts = (report as Record<string, unknown>).trustScore;
      if (ts != null && typeof ts === "object") {
        const fromTs = (ts as Record<string, unknown>).scoreRationale;
        return typeof fromTs === "string" ? fromTs.trim() : "";
      }
      return "";
    })(),
  ].filter(Boolean);

  for (const text of storedCandidates) {
    if (isExplainedVtsRationale(text)) return text;
  }

  const rebuilt = vtsSource
    ? buildVtsRationaleFromReport({
        report,
        trustScore: vtsSource.trustScore,
        grade: vtsSource.grade,
        classification: vtsSource.classification,
        productRisk: vtsSource.productRisk,
        governanceRisk: vtsSource.governanceRisk,
        operationalRisk: vtsSource.operationalRisk,
        formulaDetail: vtsSource.formulaDetail,
      })
    : null;
  if (rebuilt?.trim()) return rebuilt.trim();

  const legacy = storedCandidates[0];
  if (legacy) return legacy;

  if (typeof summaryCol === "string" && summaryCol.trim()) {
    return summaryCol.trim().replace(/\s*-+\s*$/, "").trim();
  }
  if (report == null || typeof report !== "object") return null;
  const ts = (report as Record<string, unknown>).trustScore;
  if (ts != null && typeof ts === "object") {
    const summary = (ts as Record<string, unknown>).summary;
    if (typeof summary === "string" && summary.trim()) {
      return summary.trim().replace(/\s*-+\s*$/, "").trim();
    }
  }
  return null;
}

/**
 * GET /orgAttestations/:id - returns all vendor self-attestations for the organization.
 * :id is the organization's numeric id. Matches organization_id in vendor_self_attestations (id or org name).
 * Includes completedBy (user who completed/submitted the attestation).
 */
const listOrgAttestations = async (req: Request, res: Response) => {
  try {
    const orgIdParam = String(req.params.id ?? "").trim();
    if (!orgIdParam) {
      return res.status(400).json({ message: "Organization ID is required" });
    }

    const orgRow = await db
      .select({
        id: createOrganization.id,
        organizationName: createOrganization.organizationName,
      })
      .from(createOrganization)
      .where(eq(createOrganization.id, Number(orgIdParam) || 0))
      .limit(1);

    const orgName = orgRow[0]?.organizationName ?? null;

    const whereClause = orgName
      ? or(
          eq(vendorSelfAttestations.organization_id, orgIdParam),
          eq(vendorSelfAttestations.organization_id, orgName)
        )
      : eq(vendorSelfAttestations.organization_id, orgIdParam);

    const rows = await db
      .select({
        id: vendorSelfAttestations.id,
        user_id: vendorSelfAttestations.user_id,
        vendor_self_attestation_id: vendorSelfAttestations.vendor_self_attestation_id,
        status: vendorSelfAttestations.status,
        product_name: vendorSelfAttestations.product_name,
        vendor_type: vendorSelfAttestations.vendor_type,
        company_website: vendorSelfAttestations.company_website,
        company_description: vendorSelfAttestations.company_description,
        created_at: vendorSelfAttestations.created_at,
        updated_at: vendorSelfAttestations.updated_at,
        expiry_at: vendorSelfAttestations.expiry_at,
        compliance_document_expiries: vendorSelfAttestations.compliance_document_expiries,
        latest_trust_score: vendorSelfAttestations.latest_trust_score,
        latest_trust_grade: vendorSelfAttestations.latest_trust_grade,
        generated_profile_report: vendorSelfAttestations.generated_profile_report,
        report_summary: generatedProfileReports.summary,
        report_trust_score: generatedProfileReports.trust_score,
        report_grade: generatedProfileReports.grade,
        report_score_rationale: generatedProfileReports.score_rationale,
        report_product_risk: generatedProfileReports.product_risk,
        report_governance_risk: generatedProfileReports.governance_risk,
        report_operational_risk: generatedProfileReports.operational_risk,
        report_classification: generatedProfileReports.classification,
        report_formula_detail: generatedProfileReports.formula_detail,
        profile_report_id: generatedProfileReports.id,
        llm_model_id: vendorSelfAttestations.llm_model_id,
        llm_model_label: vendorSelfAttestations.llm_model_label,
        report_llm_model_id: generatedProfileReports.llm_model_id,
        report_llm_model_label: generatedProfileReports.llm_model_label,
        user_name: usersTable.user_name,
        user_first_name: usersTable.user_first_name,
        user_last_name: usersTable.user_last_name,
        user_email: usersTable.email,
      })
      .from(vendorSelfAttestations)
      .leftJoin(usersTable, eq(vendorSelfAttestations.user_id, usersTable.id))
      .leftJoin(
        generatedProfileReports,
        eq(vendorSelfAttestations.latest_profile_report_id, generatedProfileReports.id),
      )
      .where(whereClause)
      .orderBy(desc(vendorSelfAttestations.updated_at));

    return res.status(200).json({
      message: "Attestations fetched successfully",
      data: rows.map((a) => {
        const completedByName = userDisplayName({
          user_name: a.user_name,
          user_first_name: a.user_first_name,
          user_last_name: a.user_last_name,
          email: a.user_email,
        });
        const trustScore =
          resolveTrustScore(a.latest_trust_score, a.generated_profile_report) ??
          (a.report_trust_score != null && Number.isFinite(Number(a.report_trust_score))
            ? clampScore2(Number(a.report_trust_score))
            : null);
        const grade =
          (a.latest_trust_grade != null && String(a.latest_trust_grade).trim()) ||
          (a.report_grade != null && String(a.report_grade).trim()) ||
          (() => {
            const report = a.generated_profile_report;
            if (report == null || typeof report !== "object") return null;
            const ts = (report as Record<string, unknown>).trustScore;
            if (ts != null && typeof ts === "object") {
              const g = (ts as Record<string, unknown>).grade;
              return typeof g === "string" && g.trim() ? g.trim() : null;
            }
            return null;
          })();
        const vtsRationale = resolveVtsRationale(
          a.generated_profile_report,
          a.report_summary,
          a.report_score_rationale,
          {
            trustScore,
            grade: grade || null,
            classification:
              (a.report_classification != null && String(a.report_classification).trim()) ||
              null,
            productRisk:
              a.report_product_risk != null && Number.isFinite(Number(a.report_product_risk))
                ? Number(a.report_product_risk)
                : null,
            governanceRisk:
              a.report_governance_risk != null && Number.isFinite(Number(a.report_governance_risk))
                ? Number(a.report_governance_risk)
                : null,
            operationalRisk:
              a.report_operational_risk != null &&
              Number.isFinite(Number(a.report_operational_risk))
                ? Number(a.report_operational_risk)
                : null,
            formulaDetail: a.report_formula_detail,
          },
        );
        const reportPayload =
          a.generated_profile_report != null &&
          typeof a.generated_profile_report === "object" &&
          !Array.isArray(a.generated_profile_report)
            ? (a.generated_profile_report as Record<string, unknown>)
            : null;
        const modelIdFromReport = (() => {
          if (!reportPayload) return null;
          for (const key of ["llmModelId", "llm_model_id", "modelId", "model_id"] as const) {
            const v = reportPayload[key];
            if (typeof v === "string" && v.trim()) return v.trim();
          }
          return null;
        })();

        return {
          id: a.id,
          vendor_self_attestation_id: a.vendor_self_attestation_id,
          status: (a.status ?? "DRAFT").toString().toUpperCase(),
          product_name: a.product_name ?? "",
          vendor_type: a.vendor_type ?? "",
          company_website: a.company_website ?? "",
          company_description: a.company_description ?? "",
          created_at: a.created_at,
          updated_at: a.updated_at,
          expiry_at: a.expiry_at ?? null,
          compliance_document_expiries: a.compliance_document_expiries ?? {},
          completedBy: { name: completedByName },
          trust_score: trustScore,
          trust_grade: grade || null,
          vts_rationale: vtsRationale,
          profile_report_id: a.profile_report_id ?? null,
          llm_model_id:
            (a.llm_model_id != null && String(a.llm_model_id).trim()) ||
            (a.report_llm_model_id != null && String(a.report_llm_model_id).trim()) ||
            modelIdFromReport ||
            null,
          llm_model_label:
            (a.llm_model_label != null && String(a.llm_model_label).trim()) ||
            (a.report_llm_model_label != null && String(a.report_llm_model_label).trim()) ||
            null,
        };
      }),
    });
  } catch (error) {
    console.error(
      "Error in listOrgAttestations:",
      error instanceof Error ? error.message : String(error)
    );
    return res.status(500).json({ error: "Internal server error" });
  }
};

export default listOrgAttestations;
