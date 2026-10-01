import { pgTable, uuid, varchar, integer, timestamp, jsonb, text, doublePrecision, numeric } from "drizzle-orm/pg-core";

/**
 * Stored generated product profile reports (trust score + sections).
 * Populated on POST /vendorSelfAttestation/generate-profile and COMPLETED submit.
 * Risk component columns come from Python VTS scoring service.
 */
export const generatedProfileReports = pgTable("generated_profile_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: integer("user_id").notNull(),
  organization_id: varchar("organization_id", { length: 255 }),
  attestation_id: uuid("attestation_id"),
  trust_score: numeric("trust_score", { precision: 5, scale: 2, mode: "number" }).notNull(),
  summary: text("summary"),
  report: jsonb("report").notNull(),
  product_risk: doublePrecision("product_risk"),
  governance_risk: doublePrecision("governance_risk"),
  operational_risk: doublePrecision("operational_risk"),
  weighted_risk: doublePrecision("weighted_risk"),
  grade: varchar("grade", { length: 8 }),
  classification: varchar("classification", { length: 128 }),
  formula_detail: jsonb("formula_detail"),
  scoring_version: varchar("scoring_version", { length: 32 }),
  /** Full VTS/SRS/IRS rationale block (same as terminal). */
  score_rationale: text("score_rationale"),
  score_rationale_type: varchar("score_rationale_type", { length: 8 }),
  /** Controls LLM used when this profile report was generated. */
  llm_model_id: varchar("llm_model_id", { length: 512 }),
  llm_model_label: varchar("llm_model_label", { length: 512 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
