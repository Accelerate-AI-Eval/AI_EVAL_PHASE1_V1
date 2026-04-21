import { db } from "../../database/db.js";
import { buyersTable, usersTable } from "../../schema/schema.js";
import { and, eq, sql } from "drizzle-orm";
const insertBuyerOnboarding = async (req, res) => {
    try {
        const { buyer_Id: bodyBuyerId, organization_Id: bodyOrgId, organizationId: bodyOrgIdCamel, organizationName, organizationType, sector, organizationWebsite, organizationDescription, primaryContactName, primaryContactEmail, primaryContactRole, departmentOwner, employeeCount, annualRevenue, yearFounded, headquartersLocation, operatingRegions, dataResidencyRequirements, existingAIInitiatives, aiGovernanceMaturity, dataGovernanceMaturity, aiSkillsAvailability, changeManagementCapability, primaryRegulatoryFrameworks, regulatoryPenaltyExposure, dataClassificationHandled, piiHandling, existingTechStack, aiRiskAppetite, acceptableRiskLevel, } = req.body;
        // Prefer user set by onboarding middleware (from token) – same as vendor
        let user = req.onboardingUser;
        if (!user && bodyBuyerId != null && !Number.isNaN(Number(bodyBuyerId))) {
            const byId = await db
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, Number(bodyBuyerId)))
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
        if (!user && bodyBuyerId != null && (bodyOrgId ?? bodyOrgIdCamel) != null) {
            const orgIdNum = Number(bodyOrgId ?? bodyOrgIdCamel);
            if (!Number.isNaN(orgIdNum)) {
                const byBoth = await db
                    .select()
                    .from(usersTable)
                    .where(and(eq(usersTable.id, Number(bodyBuyerId)), eq(usersTable.organization_id, orgIdNum)))
                    .limit(1);
                user = byBoth[0] ?? undefined;
            }
        }
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        if (user.user_onboarding_completed === "true") {
            return res
                .status(200)
                .json({ message: "Onboarding already completed" });
        }
        const organizationId = bodyOrgId ?? bodyOrgIdCamel ?? user.organization_id;
        const sectorValue = sector != null && typeof sector === "object"
            ? JSON.stringify(sector)
            : sector != null
                ? String(sector)
                : null;
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
            organizationId: String(organizationId ?? user.organization_id),
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
        const addBuyer = await db
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
        await db
            .update(usersTable)
            .set({
            user_platform_role: "buyer",
            user_onboarding_completed: "true",
            onboarding_status: "completed",
        })
            .where(eq(usersTable.id, user.id));
        res.status(201).json({ success: true, data: addBuyer });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to insert buyer" });
    }
};
export default insertBuyerOnboarding;
