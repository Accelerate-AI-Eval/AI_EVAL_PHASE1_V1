import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
export const assessmentDocuments = pgTable("assessment_documents", {
    id: uuid("id").defaultRandom().primaryKey(),
    assessment_id: uuid("assessment_id").notNull(),
    document_type: varchar("document_type", { length: 50 }).notNull(),
    file_path: varchar("file_path", { length: 500 }).notNull(),
    file_name: varchar("file_name", { length: 255 }),
    mime_type: varchar("mime_type", { length: 100 }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
