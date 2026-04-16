import { eq, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { createOrganization, usersTable } from "../../schema/schema.js";
import type { Request, Response } from "express";
import {
  inviteCustomerOrganizationAdmin,
  type CustomerOrgPlatformRole,
} from "../../services/organizationAdminInvite.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function cleanupNewOrganization(orgId: number) {
  await db.delete(usersTable).where(eq(usersTable.organization_id, orgId));
  await db.delete(createOrganization).where(eq(createOrganization.id, orgId));
}

const insertOrganization = async (req: Request, res: Response) => {
  try {
    const organizationName = req.body.isOrganizationName?.trim();
    const userId = req.body.user;
    const organizationTypeRaw = String(req.body.organizationType ?? "")
      .trim()
      .toLowerCase();
    const adminEmailRaw =
      req.body.adminEmail != null ? String(req.body.adminEmail).trim() : "";

    if (!organizationName) {
      return res
        .status(400)
        .json({ message: "Organization name is required" });
    }

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (organizationTypeRaw !== "vendor" && organizationTypeRaw !== "buyer") {
      return res.status(400).json({
        message: "Organization type must be vendor or buyer",
      });
    }

    if (!adminEmailRaw) {
      return res.status(400).json({ message: "Admin email is required" });
    }

    if (!EMAIL_RE.test(adminEmailRaw)) {
      return res.status(400).json({
        message: "Please enter a valid admin email address",
      });
    }

    const adminEmail = adminEmailRaw.toLowerCase();
    const organizationType = organizationTypeRaw as CustomerOrgPlatformRole;

    const organizationDuplicates = await db
      .select()
      .from(createOrganization)
      .where(
        sql`LOWER(TRIM("organizationName")) = LOWER(${organizationName})`,
      )
      .limit(1);

    if (organizationDuplicates.length > 0) {
      return res
        .status(409)
        .json({ message: "Organization already exists" });
    }

    const existingEmail = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, adminEmail))
      .limit(1);

    if (existingEmail.length > 0) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    let newOrgId: number | null = null;
    try {
      const [organization] = await db
        .insert(createOrganization)
        .values({
          organizationName,
          organizationType,
          organizationStatus: "active",
          created_by: String(userId),
        })
        .returning();

      if (!organization) {
        return res.status(500).json({ message: "Failed to create organization" });
      }

      newOrgId = organization.id;

      await inviteCustomerOrganizationAdmin({
        email: adminEmail,
        organizationId: organization.id,
        organizationName: organization.organizationName,
        invitedByUserId: String(userId),
        customerPlatformRole: organizationType,
      });

      return res.status(201).json({
        message: "Organization created successfully",
        organization,
      });
    } catch (inner: unknown) {
      if (newOrgId != null) {
        try {
          await cleanupNewOrganization(newOrgId);
        } catch (cleanupErr) {
          console.error("insertOrganization cleanup failed:", cleanupErr);
        }
      }

      const err = inner as Error & { code?: string };
      if (err.code === "EMAIL_FAILED") {
        return res.status(502).json({
          message:
            err.message ??
            "Failed to send invitation email. The organization was not saved.",
        });
      }
      if (err.code === "CONFLICT") {
        return res.status(409).json({ message: err.message });
      }
      if (err.code === "BAD_REQUEST") {
        return res.status(400).json({ message: err.message });
      }
      if (err.code === "SERVER_ERROR") {
        return res.status(500).json({ message: err.message });
      }

      console.error("Error in insertOrganization (invite):", inner);
      return res.status(500).json({ message: "Internal server error" });
    }
  } catch (error: unknown) {
    console.error("Error in insertOrganization:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default insertOrganization;
