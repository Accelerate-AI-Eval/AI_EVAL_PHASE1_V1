import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";
import { organizationStatusEnum } from "../EnumValues/enumValues.js";
export const organizationEditLogs = pgTable("organizationEditLogs", {
    id: serial("id").primaryKey(),
    organizationId: varchar("organizationId").notNull(),
    organizationName: varchar("organizationName").notNull(),
    organizationStatus: organizationStatusEnum("organizationStatus").notNull(),
    updated_by: varchar("updated_by").notNull(),
    reason: varchar("reason").notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
});
