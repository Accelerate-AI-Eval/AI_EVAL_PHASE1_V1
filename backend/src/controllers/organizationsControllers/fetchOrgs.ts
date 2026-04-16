import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { createOrganization } from "../../schema/organizations/createOrganization.js";
import { usersTable } from "../../schema/schema.js";
import { asc, sql } from "drizzle-orm";

const AI_EVAL_ORG_ID = 1;

/** Admin user_platform_role when it represents customer org kind (not platform/system roles). */
function parseCustomerOrgPlatformRole(raw: unknown): "vendor" | "buyer" | undefined {
  const p = String(raw ?? "").trim().toLowerCase();
  if (p === "vendor" || p === "buyer") return p;
  return undefined;
}

/** Fetch organizations with hasAdmin flag (each org can have only one admin for invite UI). */
const fetchOrganizations = async (req: Request, res: Response) => {
  try {
    const organizations = await db
      .select()
      .from(createOrganization);

    if (organizations.length === 0) {
      return res.status(200).json({
        message: "Organizations fetched successfully",
        data: organizations.map((o) => ({ ...o, hasAdmin: false })),
      });
    }

    const adminRows = await db
      .select({
        organization_id: usersTable.organization_id,
        user_platform_role: usersTable.user_platform_role,
        id: usersTable.id,
      })
      .from(usersTable)
      .where(sql`LOWER(TRIM(${usersTable.role})) = 'admin'`)
      .orderBy(asc(usersTable.organization_id), asc(usersTable.id));

    const orgIdsWithAdmin = new Set(
      adminRows.map((r) => r.organization_id).filter((id): id is number => id != null),
    );

    /** Prefer admin's vendor/buyer platform role for customer orgs (not AI EVAL). */
    const organizationTypeFromAdmin = new Map<number, "vendor" | "buyer">();
    for (const row of adminRows) {
      const orgId = row.organization_id;
      if (orgId == null || orgId === AI_EVAL_ORG_ID) continue;
      if (organizationTypeFromAdmin.has(orgId)) continue;
      const kind = parseCustomerOrgPlatformRole(row.user_platform_role);
      if (kind) organizationTypeFromAdmin.set(orgId, kind);
    }

    const data = organizations.map((org) => {
      const fromAdmin =
        org.id !== AI_EVAL_ORG_ID ? organizationTypeFromAdmin.get(org.id) : undefined;
      const organizationType = fromAdmin ?? org.organizationType;
      return {
        ...org,
        organizationType,
        hasAdmin: orgIdsWithAdmin.has(org.id),
      };
    });

    res.status(200).json({
      message: "Organizations fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error in fetchOrganizations:", error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: "Internal server error" });
  }
};

export default fetchOrganizations;
