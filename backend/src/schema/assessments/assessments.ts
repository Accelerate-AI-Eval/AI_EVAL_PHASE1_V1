import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { assessmentStatusEnum, assessmentTypeEnum } from "../EnumValues/enumValues.js";

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: assessmentTypeEnum("type").notNull(),
  organization_id: varchar("organization_id", { length: 255 }).notNull(),
  status: assessmentStatusEnum("status").default("draft").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  /** Expiry date: 3 months from created_at (set by DB trigger on insert; backfilled by migration). */
  expiry_at: timestamp("expiry_at", { withTimezone: true }),
  /** When set, the org chose to move this completed assessment to the Archived tab (separate from time-based expiry). */
  user_archived_at: timestamp("user_archived_at", { withTimezone: true }),
});
