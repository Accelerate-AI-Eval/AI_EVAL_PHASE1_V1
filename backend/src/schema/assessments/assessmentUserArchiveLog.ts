import { pgTable, uuid, integer, text, timestamp } from "drizzle-orm/pg-core";
import { assessments } from "./assessments.js";

export const assessmentUserArchiveLog = pgTable("assessment_user_archive_log", {
  id: uuid("id")
    .defaultRandom()
    .primaryKey()
    .notNull(),
  assessment_id: uuid("assessment_id")
    .notNull()
    .references(() => assessments.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
