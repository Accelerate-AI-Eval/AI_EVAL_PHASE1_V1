import { pgTable, varchar, integer } from "drizzle-orm/pg-core";
import { sectors } from "./sectors.js";
/** As per Excel "Industry_sectors" sheet – Industry Sectors table: industry_sector_id, industry_id, sector_name (no UUIDs). */
export const industries = pgTable("industries", {
    industrySectorId: integer("industry_sector_id").primaryKey(),
    industryId: integer("industry_id")
        .notNull()
        .references(() => sectors.industryId, { onDelete: "cascade" }),
    sectorName: varchar("sector_name", { length: 200 }).notNull(),
});
