import { pgTable, varchar, integer } from "drizzle-orm/pg-core";
/** As per Excel "Industry_sectors" sheet – Industry table: industry_id, industry_name (no UUIDs). */
export const sectors = pgTable("sectors", {
    industryId: integer("industry_id").primaryKey(),
    industryName: varchar("industry_name", { length: 100 }).notNull(),
});
