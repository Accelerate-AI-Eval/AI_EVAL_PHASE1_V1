import { db } from "../database/db.js";
import {
  vendors,
  vendorSelfAttestations,
  cotsBuyerAssessments,
  cotsVendorAssessments,
  createOrganization,
  generatedProfileReports,
} from "../schema/schema.js";
import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";

const joinOrg = sql`${createOrganization.id} = (${vendors.organizationId})::int`;

function firstNonEmptyText(...vals: (string | null | undefined)[]): string | undefined {
  for (const v of vals) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return undefined;
}

type ResolvedRow = {
  attestationId: string;
  product_name: string | null;
  status: string | null;
  updated_at: Date | null;
  target_industries: unknown;
  market_product_material: string | null;
  unique_solution: string | null;
  tech_product_specifications: string | null;
  vendorTableId: string;
  vendorUserId: number | null;
  organizationId: string | null;
  organizationName: string | null;
  vendorType: string | null;
  companyWebsite: string | null;
  companyDescription: string | null;
  headquartersLocation: string | null;
  vendorMaturity: string | null;
  sector: unknown;
};

async function trustScoresAndSummariesForAttestations(
  attestationIds: string[],
): Promise<{ scores: Record<string, number>; summaries: Record<string, string> }> {
  const scores: Record<string, number> = {};
  const summaries: Record<string, string> = {};
  if (attestationIds.length === 0) return { scores, summaries };
  const reportRows = await db
    .select({
      attestation_id: generatedProfileReports.attestation_id,
      report: generatedProfileReports.report,
      trust_score: generatedProfileReports.trust_score,
    })
    .from(generatedProfileReports)
    .where(inArray(generatedProfileReports.attestation_id, attestationIds))
    .orderBy(desc(generatedProfileReports.created_at));
  for (const row of reportRows) {
    const aid = row.attestation_id != null ? String(row.attestation_id) : "";
    if (!aid) continue;
    let report = row.report as Record<string, unknown> | string | null | undefined;
    if (typeof report === "string") {
      try {
        report = JSON.parse(report) as Record<string, unknown>;
      } catch {
        report = null;
      }
    }
    const ts = report?.trustScore as Record<string, unknown> | null | undefined;
    if (scores[aid] === undefined) {
      const overallScore = typeof ts?.overallScore === "number" ? ts.overallScore : null;
      const colScore = row.trust_score != null && Number.isFinite(Number(row.trust_score)) ? Number(row.trust_score) : null;
      const val = overallScore ?? colScore;
      if (val != null && Number.isFinite(val)) scores[aid] = val;
    }
    if (summaries[aid] === undefined) {
      const summ = typeof ts?.summary === "string" ? ts.summary.trim() : "";
      if (summ) summaries[aid] = summ;
    }
  }
  return { scores, summaries };
}

function mapRowToApiProduct(
  row: ResolvedRow,
  trustScore: number | null | undefined,
  trustSummary: string | undefined,
) {
  const apiStatus = (row.status ?? "").toUpperCase();
  const status = apiStatus === "COMPLETED" ? "Completed" : apiStatus === "REJECTED" ? "Rejected" : "Draft";
  let sector: Record<string, unknown> | string | null = null;
  const sectorRaw = row.target_industries;
  if (sectorRaw != null && typeof sectorRaw === "object" && !Array.isArray(sectorRaw)) {
    sector = sectorRaw as Record<string, unknown>;
  } else if (typeof sectorRaw === "string" && sectorRaw.trim()) {
    try {
      const p = JSON.parse(sectorRaw) as Record<string, unknown>;
      sector = typeof p === "object" && p !== null ? p : null;
    } catch {
      sector = sectorRaw;
    }
  }
  const vid = row.vendorTableId != null ? String(row.vendorTableId) : "";
  const orgIdStr =
    row.organizationId != null && String(row.organizationId).trim() !== ""
      ? String(row.organizationId)
      : vid;
  const vendor = {
    id: vid,
    organizationId: orgIdStr,
    organizationName: row.organizationName ?? null,
    vendorType: row.vendorType ?? "",
    companyWebsite: row.companyWebsite ?? "",
    companyDescription: row.companyDescription ?? "",
    headquartersLocation: row.headquartersLocation ?? "",
    vendorMaturity: row.vendorMaturity ?? "",
    sector: row.sector ?? null,
  };
  const productDescription = firstNonEmptyText(
    row.market_product_material,
    row.unique_solution,
    row.tech_product_specifications,
    trustSummary,
  );
  return {
    productId: row.attestationId,
    productName: (row.product_name ?? "").trim() || "Product",
    status,
    vendorId: vid,
    vendor,
    trustScore: trustScore != null && Number.isFinite(trustScore) ? trustScore : undefined,
    summary: trustSummary,
    productDescription: productDescription ?? undefined,
    updated_at: row.updated_at ?? null,
    sector: sector ?? undefined,
  };
}

export async function resolveProductByOrgAndProductName(
  vendorName: string,
  productName: string,
): Promise<ResolvedRow | null> {
  const vName = (vendorName ?? "").trim();
  const pName = (productName ?? "").trim();
  if (!vName || !pName) return null;
  const [row] = await db
    .select({
      attestationId: vendorSelfAttestations.id,
      product_name: vendorSelfAttestations.product_name,
      status: vendorSelfAttestations.status,
      updated_at: vendorSelfAttestations.updated_at,
      target_industries: vendorSelfAttestations.target_industries,
      market_product_material: vendorSelfAttestations.market_product_material,
      unique_solution: vendorSelfAttestations.unique_solution,
      tech_product_specifications: vendorSelfAttestations.tech_product_specifications,
      vendorTableId: vendors.id,
      vendorUserId: vendors.userId,
      organizationId: vendors.organizationId,
      organizationName: createOrganization.organizationName,
      vendorType: vendors.vendorType,
      companyWebsite: vendors.companyWebsite,
      companyDescription: vendors.companyDescription,
      headquartersLocation: vendors.headquartersLocation,
      vendorMaturity: vendors.vendorMaturity,
      sector: vendors.sector,
    })
    .from(vendors)
    .innerJoin(createOrganization, joinOrg)
    .innerJoin(vendorSelfAttestations, eq(vendorSelfAttestations.user_id, vendors.userId))
    .where(
      and(
        sql`trim(lower(${createOrganization.organizationName})) = trim(lower(${vName}))`,
        sql`trim(lower(coalesce(${vendorSelfAttestations.product_name}, ''))) = trim(lower(${pName}))`,
        sql`upper(trim(coalesce(${vendorSelfAttestations.status}, ''))) = 'COMPLETED'`,
      ),
    )
    .orderBy(desc(vendorSelfAttestations.updated_at))
    .limit(1);
  if (!row?.attestationId) return null;
  return { ...row, attestationId: String(row.attestationId) };
}

export async function resolveProductByAttestationForVendorUser(
  vendorUserId: number,
  attestationRef: string,
): Promise<ResolvedRow | null> {
  const ref = (attestationRef ?? "").trim();
  if (!ref) return null;
  const [row] = await db
    .select({
      attestationId: vendorSelfAttestations.id,
      product_name: vendorSelfAttestations.product_name,
      status: vendorSelfAttestations.status,
      updated_at: vendorSelfAttestations.updated_at,
      target_industries: vendorSelfAttestations.target_industries,
      market_product_material: vendorSelfAttestations.market_product_material,
      unique_solution: vendorSelfAttestations.unique_solution,
      tech_product_specifications: vendorSelfAttestations.tech_product_specifications,
      vendorTableId: vendors.id,
      vendorUserId: vendors.userId,
      organizationId: vendors.organizationId,
      organizationName: createOrganization.organizationName,
      vendorType: vendors.vendorType,
      companyWebsite: vendors.companyWebsite,
      companyDescription: vendors.companyDescription,
      headquartersLocation: vendors.headquartersLocation,
      vendorMaturity: vendors.vendorMaturity,
      sector: vendors.sector,
    })
    .from(vendorSelfAttestations)
    .innerJoin(vendors, eq(vendors.userId, vendorSelfAttestations.user_id))
    .leftJoin(createOrganization, joinOrg)
    .where(
      and(
        eq(vendorSelfAttestations.user_id, vendorUserId),
        or(eq(vendorSelfAttestations.id, ref), eq(vendorSelfAttestations.vendor_self_attestation_id, ref)),
        sql`upper(trim(coalesce(${vendorSelfAttestations.status}, ''))) = 'COMPLETED'`,
      ),
    )
    .limit(1);
  if (!row?.attestationId) return null;
  return { ...row, attestationId: String(row.attestationId) };
}

export async function listDirectoryProductsFromAssessments(userId: number): Promise<unknown[]> {
  const buyerRows = await db
    .select({
      vendor_name: cotsBuyerAssessments.vendor_name,
      specific_product: cotsBuyerAssessments.specific_product,
    })
    .from(cotsBuyerAssessments)
    .where(
      and(
        eq(cotsBuyerAssessments.user_id, userId),
        sql`trim(coalesce(${cotsBuyerAssessments.vendor_name}, '')) <> ''`,
        sql`trim(coalesce(${cotsBuyerAssessments.specific_product}, '')) <> ''`,
      ),
    );

  const vendorAttestationRows = await db
    .select({ vendor_attestation_id: cotsVendorAssessments.vendor_attestation_id })
    .from(cotsVendorAssessments)
    .where(and(eq(cotsVendorAssessments.user_id, userId), isNotNull(cotsVendorAssessments.vendor_attestation_id)));

  const pairSeen = new Set<string>();
  const attestationSeen = new Set<string>();
  const resolved: ResolvedRow[] = [];

  for (const br of buyerRows) {
    const vn = String(br.vendor_name ?? "").trim();
    const pn = String(br.specific_product ?? "").trim();
    const pairKey = `${vn.toLowerCase()}\0${pn.toLowerCase()}`;
    if (pairSeen.has(pairKey)) continue;
    pairSeen.add(pairKey);
    const hit = await resolveProductByOrgAndProductName(vn, pn);
    if (hit && !attestationSeen.has(hit.attestationId)) {
      attestationSeen.add(hit.attestationId);
      resolved.push(hit);
    }
  }

  for (const vr of vendorAttestationRows) {
    const aid = String(vr.vendor_attestation_id ?? "").trim();
    if (!aid || attestationSeen.has(aid)) continue;
    const hit = await resolveProductByAttestationForVendorUser(userId, aid);
    if (hit && !attestationSeen.has(hit.attestationId)) {
      attestationSeen.add(hit.attestationId);
      resolved.push(hit);
    }
  }

  const ids = resolved.map((r) => r.attestationId);
  const { scores: trustByAtt, summaries: summaryByAtt } = await trustScoresAndSummariesForAttestations(ids);

  return resolved.map((r) =>
    mapRowToApiProduct(r, trustByAtt[r.attestationId], summaryByAtt[r.attestationId]),
  );
}

export async function canViewDirectoryProductViaAssessment(
  viewerUserId: number,
  vendorTableId: string,
  vendorUserId: number,
  productId: string,
): Promise<boolean> {
  const [att] = await db
    .select({
      id: vendorSelfAttestations.id,
      vendor_self_attestation_id: vendorSelfAttestations.vendor_self_attestation_id,
      product_name: vendorSelfAttestations.product_name,
      user_id: vendorSelfAttestations.user_id,
    })
    .from(vendorSelfAttestations)
    .where(
      and(
        eq(vendorSelfAttestations.user_id, vendorUserId),
        or(eq(vendorSelfAttestations.id, productId), eq(vendorSelfAttestations.vendor_self_attestation_id, productId)),
      ),
    )
    .limit(1);

  if (!att || att.user_id !== vendorUserId) return false;

  const altId =
    att.vendor_self_attestation_id != null ? String(att.vendor_self_attestation_id).trim() : "";

  const vendorAttMatch =
    altId && altId !== productId
      ? or(
          eq(cotsVendorAssessments.vendor_attestation_id, productId),
          eq(cotsVendorAssessments.vendor_attestation_id, altId),
        )
      : eq(cotsVendorAssessments.vendor_attestation_id, productId);

  const [vCots] = await db
    .select({ id: cotsVendorAssessments.id })
    .from(cotsVendorAssessments)
    .where(and(eq(cotsVendorAssessments.user_id, viewerUserId), vendorAttMatch))
    .limit(1);
  if (vCots) return true;

  const [orgRow] = await db
    .select({ organizationName: createOrganization.organizationName })
    .from(vendors)
    .leftJoin(createOrganization, joinOrg)
    .where(eq(vendors.id, vendorTableId))
    .limit(1);
  const orgName = (orgRow?.organizationName ?? "").trim();
  const pName = String(att.product_name ?? "").trim();
  if (!orgName || !pName) return false;

  const [bCots] = await db
    .select({ id: cotsBuyerAssessments.id })
    .from(cotsBuyerAssessments)
    .where(
      and(
        eq(cotsBuyerAssessments.user_id, viewerUserId),
        sql`trim(lower(coalesce(${cotsBuyerAssessments.vendor_name}, ''))) = trim(lower(${orgName}))`,
        sql`trim(lower(coalesce(${cotsBuyerAssessments.specific_product}, ''))) = trim(lower(${pName}))`,
      ),
    )
    .limit(1);
  return !!bCots;
}
