import { db } from "../../database/db.js";
import { vendors } from "../../schema/schema.js";
import { sql } from "drizzle-orm";
/**
 * POST /vendorOnboarding/save-progress
 * Upsert vendor_onboarding only; do NOT set user_onboarding_completed.
 * Used when user clicks Continue to auto-save progress (onboardingAccess required).
 */
export default async function saveVendorOnboardingProgress(req, res) {
    try {
        const user = req.onboardingUser;
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        if (user.user_onboarding_completed === "true") {
            return res.status(200).json({ message: "Onboarding already completed" });
        }
        const { organization_Id: bodyOrgId, organizationId: bodyOrgIdCamel, vendorType, vendorName, sector, vendorMaturity, companyWebsite, companyDescription, primaryContactName, primaryContactEmail, primaryContactRole, employeeCount, yearFounded, headquartersLocation, operatingRegions, } = req.body;
        const organizationIdRaw = bodyOrgId ?? bodyOrgIdCamel ?? user.organization_id;
        const organizationId = String(organizationIdRaw ?? "").trim();
        if (!organizationId) {
            return res.status(400).json({ error: "Organization ID is required" });
        }
        const sectorValue = sector != null && typeof sector === "object"
            ? JSON.stringify(sector)
            : sector != null
                ? String(sector)
                : null;
        const sectorTruncated = sectorValue != null && sectorValue.length > 500 ? sectorValue.slice(0, 500) : sectorValue;
        const yearFoundedNum = yearFounded != null ? Number(yearFounded) : new Date().getFullYear();
        const operatingRegionsValue = Array.isArray(operatingRegions) || (operatingRegions != null && typeof operatingRegions === "object")
            ? operatingRegions
            : null;
        const vendorValues = {
            userId: user.id,
            organizationId,
            vendorType: String(vendorType ?? ""),
            vendorName: vendorName != null && String(vendorName).trim() !== "" ? String(vendorName).trim() : null,
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
        await db
            .insert(vendors)
            .values(vendorValues)
            .onConflictDoUpdate({
            target: vendors.organizationId,
            set: {
                userId: user.id,
                vendorType: vendorValues.vendorType,
                vendorName: vendorValues.vendorName,
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
        res.status(200).json({ success: true, message: "Progress saved" });
    }
    catch (error) {
        console.error("saveVendorOnboardingProgress error:", error);
        res.status(500).json({ error: "Failed to save progress" });
    }
}
