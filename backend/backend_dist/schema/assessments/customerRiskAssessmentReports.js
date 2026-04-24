import { pgTable, uuid, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
/**
 * Analysis Report records generated when a vendor COTS assessment is submitted.
 * Title format: "Analysis Report: {organization name} - {product name}"
 */
export const customerRiskAssessmentReports = pgTable("customer_risk_assessment_reports", {
    id: uuid("id").defaultRandom().primaryKey(),
    assessment_id: uuid("assessment_id").notNull(),
    organization_id: varchar("organization_id", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    report: jsonb("report").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
