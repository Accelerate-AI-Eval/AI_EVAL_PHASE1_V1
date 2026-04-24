import { pgTable, uuid, varchar, timestamp, text, integer } from "drizzle-orm/pg-core";
/**
 * Generated general reports (e.g. Executive Stakeholder Brief) per assessment.
 * Stored with assessment_id, created_at, and created_by (user id).
 */
export const generalReports = pgTable("general_reports", {
    id: uuid("id").defaultRandom().primaryKey(),
    assessment_id: uuid("assessment_id").notNull(),
    organization_id: varchar("organization_id", { length: 255 }).notNull(),
    report_type: varchar("report_type", { length: 255 }).notNull(),
    /** Generated content (e.g. Executive Brief sections 16–21). */
    content: text("content"),
    /** Display label for the assessment (e.g. "Org Name and Product Name"). */
    assessment_label: varchar("assessment_label", { length: 500 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    created_by: integer("created_by").notNull(),
});
