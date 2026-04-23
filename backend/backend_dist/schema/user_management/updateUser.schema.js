import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";
import { organizationStatusEnum } from "../EnumValues/enumValues.js";
export const userEditLogs = pgTable("userEditLogs", {
    id: serial("id").primaryKey(),
    userId: varchar("userId").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    organizationName: varchar("organizationName").notNull(),
    userStatus: organizationStatusEnum("userStatus").notNull(),
    updated_by: varchar("updated_by").notNull(),
    reason: varchar("reason").notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
});
