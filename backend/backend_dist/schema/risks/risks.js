import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
export const risks = pgTable("risks", {
    id: uuid("id").defaultRandom().primaryKey(),
    risk_id: varchar("risk_id", { length: 50 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    domain: varchar("domain", { length: 100 }),
    description: text("description"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
