import { db } from "../database/db.js";
import { vendors, vendorSelfAttestations, createOrganization } from "../schema/schema.js";
import { generatedProfileReports } from "../schema/assessments/generatedProfileReports.js";
import { mergeSummaryIntoReport } from "../utils/mergeProfileReportSummary.js";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

/**
 * Same VTS source as Product Profile: merge latest generated_profile_reports.trust_score
 * into attestation.generated_profile_report / latest_trust_score.
 */
export async function enrichAttestationWithProductProfileVts(
  attestation: Record<string, unknown> | null,
): Promise<Record<string, unknown> | null> {
  if (!attestation) return null;
  const attestationId = String(
    attestation.id ?? attestation.vendor_self_attestation_id ?? "",
  ).trim();
  if (!attestationId) return attestation;

  const [reportRow] = await db
    .select({
      report: generatedProfileReports.report,
      summary: generatedProfileReports.summary,
      trust_score: generatedProfileReports.trust_score,
    })
    .from(generatedProfileReports)
    .where(eq(generatedProfileReports.attestation_id, attestationId))
    .orderBy(desc(generatedProfileReports.created_at))
    .limit(1);

  const out: Record<string, unknown> = { ...attestation };

  if (reportRow?.report != null || reportRow?.trust_score != null) {
    out.generated_profile_report = mergeSummaryIntoReport(
      reportRow.report,
      reportRow.summary,
      reportRow.trust_score,
    );
    if (
      reportRow.trust_score != null &&
      Number.isFinite(Number(reportRow.trust_score)) &&
      Number(reportRow.trust_score) > 0
    ) {
      out.latest_trust_score =
        Math.min(100, Math.max(0, Math.round((Number(reportRow.trust_score) + Number.EPSILON) * 100) / 100));
    }
  } else if (out.latest_trust_score != null && Number.isFinite(Number(out.latest_trust_score))) {
    out.generated_profile_report = mergeSummaryIntoReport(
      out.generated_profile_report,
      null,
      Number(out.latest_trust_score),
    );
  }

  return out;
}

/**
 * Find the vendor's completed buyer-visible attestation row matching directory vendor name + product name.
 */
export async function findAttestationForBuyerVendorProduct(
  vendorName: string,
  productName: string,
): Promise<Record<string, unknown> | null> {
  const vName = (vendorName ?? "").trim();
  const pName = (productName ?? "").trim();
  if (!vName || !pName) return null;

  const joinOrg = sql`${createOrganization.id} = (${vendors.organizationId})::int`;

  const rows = await db
    .select({
      row: vendorSelfAttestations,
    })
    .from(vendors)
    .innerJoin(createOrganization, joinOrg)
    .innerJoin(
      vendorSelfAttestations,
      sql`trim(coalesce(${vendorSelfAttestations.organization_id}, '')) = trim(coalesce(${vendors.organizationId}, ''))`,
    )
    .where(
      and(
        // Public Directory Listing no longer required — visible_to_buyer on the product is enough
        // eq(vendors.publicDirectoryListing, true),
        sql`trim(lower(${createOrganization.organizationName})) = trim(lower(${vName}))`,
        sql`trim(lower(coalesce(${vendorSelfAttestations.product_name}, ''))) = trim(lower(${pName}))`,
        sql`upper(trim(coalesce(${vendorSelfAttestations.status}, ''))) = 'COMPLETED'`,
        eq(vendorSelfAttestations.visible_to_buyer, true),
        sql`(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`,
        isNull(vendorSelfAttestations.user_archived_at),
      ),
    )
    .orderBy(desc(vendorSelfAttestations.updated_at))
    .limit(1);

  const r = rows[0]?.row;
  if (!r) return null;
  return enrichAttestationWithProductProfileVts({ ...(r as object) } as Record<string, unknown>);
}

const completedVisibleBuyerAttestation = and(
  sql`upper(trim(coalesce(${vendorSelfAttestations.status}, ''))) = 'COMPLETED'`,
  eq(vendorSelfAttestations.visible_to_buyer, true),
  sql`(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`,
  isNull(vendorSelfAttestations.user_archived_at),
);

/**
 * Resolve attestation for buyer-side vendor risk report: prefer explicit attestation id from the assessment
 * (directory product / organization flow), else match by public vendor name + product name.
 */
export async function findAttestationForBuyerAssessment(opts: {
  attestationId?: string | null;
  vendorName: string;
  productName: string;
}): Promise<Record<string, unknown> | null> {
  const id = (opts.attestationId ?? "").trim();
  if (id) {
    const [row] = await db
      .select()
      .from(vendorSelfAttestations)
      .where(
        and(
          or(eq(vendorSelfAttestations.id, id), eq(vendorSelfAttestations.vendor_self_attestation_id, id)),
          completedVisibleBuyerAttestation,
        ),
      )
      .limit(1);
    if (row) {
      return enrichAttestationWithProductProfileVts({
        ...(row as object),
      } as Record<string, unknown>);
    }
  }
  return findAttestationForBuyerVendorProduct(opts.vendorName, opts.productName);
}
