import { pgTable, uuid, integer, text, timestamp } from "drizzle-orm/pg-core";
import { vendorSelfAttestations } from "./vendorSelfAttestations.js";

export const vendorSelfAttestationUserArchiveLog = pgTable("vendor_self_attestation_user_archive_log", {
  id: uuid("id")
    .defaultRandom()
    .primaryKey()
    .notNull(),
  vendor_self_attestation_id: uuid("vendor_self_attestation_id")
    .notNull()
    .references(() => vendorSelfAttestations.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
