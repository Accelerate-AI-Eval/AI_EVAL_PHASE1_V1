import { pgTable, serial, varchar, text } from "drizzle-orm/pg-core";
/**
 * risk_mappings – risk_mapping_id (integer PK), risk_id (Excel value as-is), plus Excel columns.
 * Headers: Risk_id, Risk_Title, Domains, Description, Technical_Description, Executive_Summary,
 * Attack_Vector, Observable_Indicators, Data_to_Identify_Risk, Evidence_Sources,
 * Intent, Timing, Risk_Type_Detected, Primary_Risk, Secondary_Risks.
 */
export const riskMappings = pgTable("risk_mappings", {
    risk_mapping_id: serial("risk_mapping_id").primaryKey(),
    risk_id: varchar("risk_id", { length: 255 }),
    risk_title: varchar("risk_title", { length: 255 }),
    domains: varchar("domains", { length: 255 }),
    description: text("description"),
    technical_description: text("technical_description"),
    executive_summary: text("executive_summary"),
    attack_vector: varchar("attack_vector", { length: 255 }),
    observable_indicators: text("observable_indicators"),
    data_to_identify_risk: text("data_to_identify_risk"),
    evidence_sources: text("evidence_sources"),
    intent: varchar("intent", { length: 255 }),
    timing: varchar("timing", { length: 255 }),
    risk_type_detected: varchar("risk_type_detected", { length: 255 }),
    primary_risk: varchar("primary_risk", { length: 255 }),
    secondary_risks: varchar("secondary_risks", { length: 255 }),
});
