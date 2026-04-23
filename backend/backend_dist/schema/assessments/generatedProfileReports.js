import { pgTable, uuid, varchar, integer, timestamp, jsonb, text } from "drizzle-orm/pg-core";
/**
 * Stored generated product profile reports (trust score + sections).
 * Populated on POST /vendorSelfAttestation/generate-profile.
 */
export const generatedProfileReports = pgTable("generated_profile_reports", {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: integer("user_id").notNull(),
    organization_id: varchar("organization_id", { length: 255 }),
    attestation_id: uuid("attestation_id"),
    trust_score: integer("trust_score").notNull(),
    summary: text("summary"),
    report: jsonb("report").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
