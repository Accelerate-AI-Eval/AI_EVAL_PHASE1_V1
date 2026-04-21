/**
 * Maps each attestation step section to backend payload keys (snake_case).
 * Used by AttestationDynamicStep to bind text inputs to form state.
 * "array" = store as single-element array for jsonb columns; "string" = store as string.
 */
import type { VendorSelfAttestationPayload } from "../types/vendorSelfAttestation";

export type AttestationFieldType = "string" | "array";

export interface AttestationFieldMapping {
  key: keyof VendorSelfAttestationPayload;
  type: AttestationFieldType;
}

/** Section key -> list of (payload key, type). Index in array = data index; use null to skip (e.g. upload-only row). */
export const ATTESTATION_SECTION_FIELDS: Record<string, (AttestationFieldMapping | null)[]> = {
  product_profile: [
    { key: "product_name", type: "string" },
    { key: "purchase_decision_makers", type: "array" },
    { key: "pain_points_solved", type: "string" },
    { key: "alternatives_considered", type: "string" },
    { key: "unique_value_proposition", type: "string" },
    { key: "typical_customer_roi", type: "string" },
  ],
  ai_technical_capabilities: [
    { key: "ai_capabilities", type: "array" },
    { key: "ai_model_types", type: "array" },
    { key: "model_transparency", type: "string" },
    { key: "decision_autonomy", type: "string" },
    { key: "documented_ai_governance_policy", type: "string" },
  ],
  compliance_certifications: [
    null, // security_certifications — section commented out
    { key: "assessment_completion_level", type: "string" },
    { key: "audit_frequency", type: "string" },
  ],
  data_handling_privacy: [
    { key: "pii_handling", type: "string" },
    { key: "data_residency_options", type: "array" },
    { key: "data_retention_policy", type: "string" },
  ],
  ai_safety_testing: [
    { key: "bias_testing_approach", type: "array" },
    { key: "adversarial_security_testing", type: "string" },
    { key: "human_oversight", type: "array" },
    { key: "training_data_documentation", type: "string" },
  ],
  operations_reliability: [
    { key: "uptime_sla", type: "string" },
    { key: "support_slas", type: "string" },
    { key: "change_management", type: "string" },
    { key: "incident_response_plan", type: "string" },
    { key: "rollback_capability", type: "string" },
  ],
  deployment_architecture: [
    { key: "hosting_deployment", type: "array" },
    { key: "deployment_scale", type: "string" },
    { key: "product_stage", type: "string" },
  ],
  evidence_supporting_documentation: [
    null, // index 0 = document upload (no text field)
    { key: "interaction_data_available", type: "string" },
    { key: "audit_logs_available", type: "string" },
    { key: "testing_results_available", type: "string" },
  ],
};
