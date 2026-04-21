/**
 * Company profile section in Vendor Self Attestation (prefilled from vendor onboarding).
 * Matches backend vendor_onboarding / GET companyProfile shape.
 */
export interface AttestationCompanyProfile {
  vendorName?: string;
  vendorType: string;
  sector: Record<string, string[]> | Record<string, unknown>;
  vendorMaturity: string;
  companyWebsite: string;
  companyDescription: string;
  employeeCount: string;
  yearFounded: number | string;
  headquartersLocation: string;
  operatingRegions: string[];
}

/**
 * Payload sent to POST /vendorSelfAttestation (vendor_self_attestations table).
 * Snake_case to align with backend; frontend can use camelCase and map on submit.
 */
export interface VendorSelfAttestationPayload {
  product_name?: string | null;
  purchase_decision_makers?: string[] | null;
  pain_points_solved?: string | null;
  alternatives_considered?: string | null;
  unique_value_proposition?: string | null;
  typical_customer_roi?: string | null;
  ai_capabilities?: string[] | null;
  ai_model_types?: string[] | null;
  model_transparency?: string | null;
  decision_autonomy?: string | null;
  /** Yes / No — documented AI governance policy; if Yes, upload file(s) to documentUpload.aiGovernancePolicy */
  documented_ai_governance_policy?: string | null;
  security_certifications?: string[] | null;
  assessment_completion_level?: string | null;
  audit_frequency?: string | null;
  pii_handling?: string | null;
  data_residency_options?: string[] | null;
  data_retention_policy?: string | null;
  bias_testing_approach?: string[] | null;
  adversarial_security_testing?: string | null;
  human_oversight?: string[] | null;
  training_data_documentation?: string | null;
  uptime_sla?: string | null;
  support_slas?: string | null;
  change_management?: string | null;
  incident_response_plan?: string | null;
  rollback_capability?: string | null;
  hosting_deployment?: string[] | null;
  deployment_scale?: string | null;
  product_stage?: string | null;
  interaction_data_available?: string | null;
  audit_logs_available?: string | null;
  testing_results_available?: string | null;
}

/**
 * Regulatory (section 2) uses multi-select categories; each category has its own file list.
 */
export interface RegulatoryDocumentUpload {
  categories: string[];
  byCategory: Record<string, string[]>;
}

/**
 * Document upload structure stored in backend document_uploads jsonb.
 * - "0": Marketing and Product Material (file names)
 * - "1": Technical Product Specifications Material (file names)
 * - "2": "Which compliance certifications do you hold? (attach evidence for each)" (multi-select categories + files per category)
 * - evidenceTestingPolicy: file names for "Upload Testing and Policy Documentation (Optional)"
 * - aiGovernancePolicy: file names when user answers Yes to documented AI governance policy (AI Technical Capabilities)
 */
export interface DocumentUploadState {
  "0": string[];
  "1": string[];
  "2": RegulatoryDocumentUpload;
  evidenceTestingPolicy: string[];
  aiGovernancePolicy: string[];
}

/**
 * Full form state for Vendor Self Attestation: company profile (step 0) + attestation fields.
 */
export interface VendorSelfAttestationFormState {
  companyProfile: AttestationCompanyProfile;
  attestation: VendorSelfAttestationPayload;
  /** Document uploads: by category + evidence testing policy (persisted in backend document_uploads jsonb). */
  documentUpload?: DocumentUploadState;
}
