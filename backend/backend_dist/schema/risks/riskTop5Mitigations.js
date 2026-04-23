import { pgTable, integer, varchar, text } from "drizzle-orm/pg-core";
export const riskTop5Mitigations = pgTable("risk_top5_mitigations", {
    mapping_id: integer("mapping_id").notNull(),
    risk_id: varchar("risk_id", { length: 50 }).notNull(),
    mitigation_action_id: varchar("mitigation_action_id", { length: 100 }).notNull(),
    mitigation_action_name: varchar("mitigation_action_name", { length: 500 }).notNull(),
    mitigation_category: varchar("mitigation_category", { length: 200 }).notNull(),
    mitigation_definition: text("mitigation_definition"),
});
