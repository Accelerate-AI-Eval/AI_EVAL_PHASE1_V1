import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
export const assessmentRisks = pgTable("assessment_risks", {
    id: uuid("id").defaultRandom().primaryKey(),
    assessment_id: uuid("assessment_id").notNull(),
    risk_id: uuid("risk_id").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
