import { db } from "../../database/db.js";
import { sectors, industries } from "../../schema/lookup/index.js";
import { asc } from "drizzle-orm";
/**
 * GET /sectors – returns all sectors with nested industries.
 * Used by frontend for sector/industry dropdowns and to display sector details for vendor/buyer.
 */
const getSectors = async (_req, res) => {
    try {
        const sectorsRows = await db
            .select()
            .from(sectors)
            .orderBy(asc(sectors.industryId));
        const industriesRows = await db
            .select()
            .from(industries)
            .orderBy(asc(industries.industryId), asc(industries.industrySectorId));
        const industryList = industriesRows.map((r) => ({
            id: r.industrySectorId,
            sectorId: r.industryId,
            name: r.sectorName,
        }));
        const data = sectorsRows.map((s) => ({
            id: s.industryId,
            name: s.industryName,
            industries: industryList.filter((i) => i.sectorId === s.industryId),
        }));
        res.status(200).json({
            success: true,
            data: { sectors: data },
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("getSectors:", message);
        res.status(500).json({ success: false, message: "Failed to fetch sectors" });
    }
};
export default getSectors;
