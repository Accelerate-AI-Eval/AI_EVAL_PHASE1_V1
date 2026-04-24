import jwt from "jsonwebtoken";
import { db } from "../../database/db.js";
import { createOrganization, usersTable, vendors } from "../../schema/schema.js";
import { and, eq, sql } from "drizzle-orm";
import { getJwtExpiry, getJwtSecret } from "../../config/auth.js";
const insertVendorOnboarding = async (req, res) => {
    // console.log(req.body);
    try {
        const { vendorType, organization_Id: bodyOrgId, organizationId: bodyOrgIdCamel, vendorId: bodyVendorId, sector, vendorMaturity, companyWebsite, companyDescription, primaryContactName, primaryContactEmail, primaryContactRole, employeeCount, yearFounded, headquartersLocation, operatingRegions, } = req.body;
        // Prefer user set by onboarding middleware (from token)
        let user = req.onboardingUser;
        if (!user && bodyVendorId != null && !Number.isNaN(Number(bodyVendorId))) {
            const byId = await db
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, Number(bodyVendorId)))
                .limit(1);
            user = byId[0] ?? undefined;
        }
        if (!user && (bodyOrgId ?? bodyOrgIdCamel) != null) {
            const orgIdNum = Number(bodyOrgId ?? bodyOrgIdCamel);
            if (!Number.isNaN(orgIdNum)) {
                const byOrg = await db
                    .select()
                    .from(usersTable)
                    .where(eq(usersTable.organization_id, orgIdNum))
                    .limit(1);
                user = byOrg[0] ?? undefined;
            }
        }
        if (!user && bodyVendorId != null && (bodyOrgId ?? bodyOrgIdCamel) != null) {
            const orgIdNum = Number(bodyOrgId ?? bodyOrgIdCamel);
            if (!Number.isNaN(orgIdNum)) {
                const byBoth = await db
                    .select()
                    .from(usersTable)
                    .where(and(eq(usersTable.id, Number(bodyVendorId)), eq(usersTable.organization_id, orgIdNum)))
                    .limit(1);
                user = byBoth[0] ?? undefined;
            }
        }
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        if (user.user_onboarding_completed === "true") {
            // Return token + userDetails so frontend can set bearerToken and user can proceed to attestation
            const [existingRow] = await db
                .select({
                user: usersTable,
                organizationName: createOrganization.organizationName,
            })
                .from(usersTable)
                .leftJoin(createOrganization, eq(usersTable.organization_id, createOrganization.id))
                .where(eq(usersTable.id, user.id))
                .limit(1);
            const u = existingRow?.user;
            const organizationName = existingRow?.organizationName ?? "";
            const token = jwt.sign({ id: u?.id, email: u?.email, userRole: u?.role }, getJwtSecret(), { expiresIn: getJwtExpiry() });
            const userDetails = [
                {
                    ...u,
                    organization_name: organizationName,
                    organization_id: u?.organization_id,
                },
            ];
            return res.status(200).json({
                message: "Onboarding already completed",
                token,
                userDetails,
            });
        }
        const organizationIdRaw = bodyOrgId ?? bodyOrgIdCamel ?? user.organization_id;
        const organizationId = String(organizationIdRaw ?? "").trim();
        if (!organizationId) {
            return res.status(400).json({
                error: "Organization ID is required",
                details: "organization_Id, organizationId, or user organization_id is missing or empty",
            });
        }
        const sectorValue = sector != null && typeof sector === "object"
            ? JSON.stringify(sector)
            : sector != null
                ? String(sector)
                : null;
        const sectorTruncated = sectorValue != null && sectorValue.length > 500
            ? sectorValue.slice(0, 500)
            : sectorValue;
        const yearFoundedNum = yearFounded != null ? Number(yearFounded) : new Date().getFullYear();
        const operatingRegionsValue = Array.isArray(operatingRegions) || (operatingRegions != null && typeof operatingRegions === "object")
            ? operatingRegions
            : null;
        const vendorValues = {
            userId: user.id,
            organizationId,
            vendorType: String(vendorType ?? ""),
            sector: sectorTruncated,
            vendorMaturity: vendorMaturity != null ? String(vendorMaturity) : null,
            companyWebsite: String(companyWebsite ?? ""),
            companyDescription: String(companyDescription ?? ""),
            primaryContactName: String(primaryContactName ?? ""),
            primaryContactEmail: String(primaryContactEmail ?? ""),
            primaryContactRole: primaryContactRole != null ? String(primaryContactRole) : null,
            employeeCount: String(employeeCount ?? ""),
            yearFounded: Number.isNaN(yearFoundedNum) ? new Date().getFullYear() : yearFoundedNum,
            headquartersLocation: String(headquartersLocation ?? ""),
            operatingRegions: operatingRegionsValue,
        };
        const addVendor = await db
            .insert(vendors)
            .values(vendorValues)
            .onConflictDoUpdate({
            target: vendors.organizationId,
            set: {
                userId: user.id,
                vendorType: vendorValues.vendorType,
                sector: vendorValues.sector,
                vendorMaturity: vendorValues.vendorMaturity,
                companyWebsite: vendorValues.companyWebsite,
                companyDescription: vendorValues.companyDescription,
                primaryContactName: vendorValues.primaryContactName,
                primaryContactEmail: vendorValues.primaryContactEmail,
                primaryContactRole: vendorValues.primaryContactRole,
                employeeCount: vendorValues.employeeCount,
                yearFounded: vendorValues.yearFounded,
                headquartersLocation: vendorValues.headquartersLocation,
                operatingRegions: vendorValues.operatingRegions,
                updatedAt: sql `now()`,
            },
        });
        await db
            .update(usersTable)
            .set({
            user_platform_role: "vendor",
            user_onboarding_completed: "true",
            onboarding_status: "completed",
        })
            .where(eq(usersTable.id, user.id));
        const [updatedRow] = await db
            .select({
            user: usersTable,
            organizationName: createOrganization.organizationName,
        })
            .from(usersTable)
            .leftJoin(createOrganization, eq(usersTable.organization_id, createOrganization.id))
            .where(eq(usersTable.id, user.id))
            .limit(1);
        const u = updatedRow?.user;
        const organizationName = updatedRow?.organizationName ?? "";
        const token = jwt.sign({ id: u?.id, email: u?.email, userRole: u?.role }, getJwtSecret(), { expiresIn: getJwtExpiry() });
        const userDetails = [
            {
                ...u,
                organization_name: organizationName,
                organization_id: u?.organization_id,
            },
        ];
        res.status(201).json({
            success: true,
            data: addVendor,
            token,
            userDetails,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const code = error && typeof error.code === "string" ? error.code : undefined;
        console.error("Vendor onboarding insert error:", error);
        res.status(500).json({
            error: "Failed to insert vendor",
            details: message,
            ...(code && { code }),
        });
    }
};
export default insertVendorOnboarding;
