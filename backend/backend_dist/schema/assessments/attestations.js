import { pgTable, uuid, varchar, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
/**
 * Attestation table: id, status (DRAFT | COMPLETED), formData (jsonb), createdAt, updatedAt.
 * Scoped by user_id for list/filter.
 */
export const attestations = pgTable("attestations", {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: integer("user_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("DRAFT"), // DRAFT | COMPLETED
    form_data: jsonb("form_data").notNull(), // full attestation form payload
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
