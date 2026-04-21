import { db } from "../../database/db.js";
import { buyersTable } from "../../schema/schema.js";
import { sql } from "drizzle-orm";
/**
 * POST /buyerOnboarding/save-progress
 * Upsert buyer_onboarding only; do NOT set user_onboarding_completed.
 * Used when user clicks Continue to auto-save progress (onboardingAccess required).
 */
export default async function saveBuyerOnboardingProgress(req, res) {
    try {
        const user = req.onboardingUser;
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        if (user.user_onboarding_completed === "true") {
            return res.status(200).json({ message: "Onboarding already completed" });
        }
        const organizationId = String(req.body.organization_Id ?? req.body.organizationId ?? user.organization_id ?? "").trim();
        if (!organizationId) {
            return res.status(400).json({ error: "Organization ID is required" });
        }
        const { organizationName, organizationType, sector, organizationWebsite, organizationDescription, primaryContactName, primaryContactEmail, primaryContactRole, departmentOwner, employeeCount, annualRevenue, yearFounded, headquartersLocation, operatingRegions, dataResidencyRequirements, existingAIInitiatives, aiGovernanceMaturity, dataGovernanceMaturity, aiSkillsAvailability, changeManagementCapability, primaryRegulatoryFrameworks, regulatoryPenaltyExposure, dataClassificationHandled, piiHandling, existingTechStack, aiRiskAppetite, acceptableRiskLevel, } = req.body;
        const sectorValue = sector != null && typeof sector === "object" ? JSON.stringify(sector) : sector != null ? String(sector) : null;
        const operatingRegionsValue = Array.isArray(operatingRegions) || (operatingRegions != null && typeof operatingRegions === "object")
            ? operatingRegions
            : null;
        const dataResidencyValue = dataResidencyRequirements != null && typeof dataResidencyRequirements === "object"
            ? dataResidencyRequirements
            : dataResidencyRequirements != null
                ? JSON.stringify(dataResidencyRequirements)
                : null;
        const primaryRegulatoryValue = primaryRegulatoryFrameworks != null && typeof primaryRegulatoryFrameworks === "object"
            ? primaryRegulatoryFrameworks
            : primaryRegulatoryFrameworks != null
                ? JSON.stringify(primaryRegulatoryFrameworks)
                : null;
        const dataClassificationValue = dataClassificationHandled != null && typeof dataClassificationHandled === "object"
            ? dataClassificationHandled
            : dataClassificationHandled != null
                ? JSON.stringify(dataClassificationHandled)
                : null;
        const existingTechStackValue = existingTechStack != null && typeof existingTechStack === "object"
            ? existingTechStack
            : existingTechStack != null
                ? JSON.stringify(existingTechStack)
                : null;
        const buyerValues = {
            userId: user.id,
            organizationId,
            organizationName: String(organizationName ?? ""),
            organizationType: organizationType != null ? String(organizationType) : null,
            sector: sectorValue,
            organizationWebsite: organizationWebsite != null ? String(organizationWebsite) : null,
            organizationDescription: organizationDescription != null ? String(organizationDescription) : null,
            primaryContactName: String(primaryContactName ?? ""),
            primaryContactEmail: String(primaryContactEmail ?? ""),
            primaryContactRole: primaryContactRole != null ? String(primaryContactRole) : null,
            departmentOwner: departmentOwner != null ? String(departmentOwner) : null,
            employeeCount: employeeCount != null ? String(employeeCount) : null,
            annualRevenue: annualRevenue != null ? String(annualRevenue) : null,
            yearFounded: yearFounded != null ? Number(yearFounded) : null,
            headquartersLocation: headquartersLocation != null ? String(headquartersLocation) : null,
            operatingRegions: operatingRegionsValue,
            dataResidencyRequirements: dataResidencyValue,
            existingAIInitiatives: existingAIInitiatives != null ? String(existingAIInitiatives) : null,
            aiGovernanceMaturity: aiGovernanceMaturity != null ? String(aiGovernanceMaturity) : null,
            dataGovernanceMaturity: dataGovernanceMaturity != null ? String(dataGovernanceMaturity) : null,
            aiSkillsAvailability: aiSkillsAvailability != null ? String(aiSkillsAvailability) : null,
            changeManagementCapability: changeManagementCapability != null ? String(changeManagementCapability) : null,
            primaryRegulatoryFrameworks: primaryRegulatoryValue,
            regulatoryPenaltyExposure: regulatoryPenaltyExposure != null ? String(regulatoryPenaltyExposure) : null,
            dataClassificationHandled: dataClassificationValue,
            piiHandling: piiHandling != null ? String(piiHandling) : null,
            existingTechStack: existingTechStackValue,
            aiRiskAppetite: aiRiskAppetite != null ? String(aiRiskAppetite) : null,
            acceptableRiskLevel: acceptableRiskLevel != null ? String(acceptableRiskLevel) : null,
        };
        await db
            .insert(buyersTable)
            .values(buyerValues)
            .onConflictDoUpdate({
            target: buyersTable.organizationId,
            set: {
                userId: user.id,
                organizationName: buyerValues.organizationName,
                organizationType: buyerValues.organizationType,
                sector: buyerValues.sector,
                organizationWebsite: buyerValues.organizationWebsite,
                organizationDescription: buyerValues.organizationDescription,
                primaryContactName: buyerValues.primaryContactName,
                primaryContactEmail: buyerValues.primaryContactEmail,
                primaryContactRole: buyerValues.primaryContactRole,
                departmentOwner: buyerValues.departmentOwner,
                employeeCount: buyerValues.employeeCount,
                annualRevenue: buyerValues.annualRevenue,
                yearFounded: buyerValues.yearFounded,
                headquartersLocation: buyerValues.headquartersLocation,
                operatingRegions: buyerValues.operatingRegions,
                dataResidencyRequirements: buyerValues.dataResidencyRequirements,
                existingAIInitiatives: buyerValues.existingAIInitiatives,
                aiGovernanceMaturity: buyerValues.aiGovernanceMaturity,
                dataGovernanceMaturity: buyerValues.dataGovernanceMaturity,
                aiSkillsAvailability: buyerValues.aiSkillsAvailability,
                changeManagementCapability: buyerValues.changeManagementCapability,
                primaryRegulatoryFrameworks: buyerValues.primaryRegulatoryFrameworks,
                regulatoryPenaltyExposure: buyerValues.regulatoryPenaltyExposure,
                dataClassificationHandled: buyerValues.dataClassificationHandled,
                piiHandling: buyerValues.piiHandling,
                existingTechStack: buyerValues.existingTechStack,
                aiRiskAppetite: buyerValues.aiRiskAppetite,
                acceptableRiskLevel: buyerValues.acceptableRiskLevel,
                updatedAt: sql `now()`,
            },
        });
        res.status(200).json({ success: true, message: "Progress saved" });
    }
    catch (error) {
        console.error("saveBuyerOnboardingProgress error:", error);
        res.status(500).json({ error: "Failed to save progress" });
    }
}
