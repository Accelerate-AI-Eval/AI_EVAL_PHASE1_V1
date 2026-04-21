/**
 * Options / Validation values for Vendor Self Attestation (Sheet 1).
 * Used by attestation form components; fetch by section and field key.
 */
export interface OptionItem {
  label: string;
  value: string;
}

// ----- Product Profile -----
export const PURCHASE_DECISION_MAKERS_OPTIONS: OptionItem[] = [
  { label: "CTO/VP Engineering", value: "CTO/VP Engineering" },
  { label: "CDO/Head of Data Science", value: "CDO/Head of Data Science" },
  { label: "Chief AI Officer", value: "Chief AI Officer" },
  { label: "Chief Risk Officer", value: "Chief Risk Officer" },
  { label: "VP Product", value: "VP Product" },
  { label: "Line of Business Leader", value: "Line of Business Leader" },
  { label: "IT/Infrastructure Teams", value: "IT/Infrastructure Teams" },
  { label: "Other", value: "Other" },
];

// ----- AI Technical Capabilities -----
export const AI_CAPABILITIES_OPTIONS: OptionItem[] = [
  {
    label: "Natural Language Processing (NLP)",
    value: "Natural Language Processing (NLP)",
  },
  { label: "Computer Vision", value: "Computer Vision" },
  { label: "Generative AI (Text)", value: "Generative AI (Text)" },
  {
    label: "Generative AI (Images/Video)",
    value: "Generative AI (Images/Video)",
  },
  {
    label: "Speech Recognition/Synthesis",
    value: "Speech Recognition/Synthesis",
  },
  { label: "Predictive Analytics/ML", value: "Predictive Analytics/ML" },
  { label: "Recommendation Systems", value: "Recommendation Systems" },
  { label: "Autonomous Decision-Making", value: "Autonomous Decision-Making" },
  { label: "Reinforcement Learning", value: "Reinforcement Learning" },
  { label: "Other", value: "Other" },
];

export const AI_MODEL_TYPES_OPTIONS: OptionItem[] = [
  {
    label: "Off-the-shelf (OpenAI, Anthropic, etc.)",
    value: "Off-the-shelf (OpenAI, Anthropic, etc.)",
  },
  {
    label: "Fine-tuned from foundation models",
    value: "Fine-tuned from foundation models",
  },
  {
    label: "Fully custom-trained models",
    value: "Fully custom-trained models",
  },
  {
    label: "Traditional ML (non-neural)",
    value: "Traditional ML (non-neural)",
  },
  { label: "Ensemble/Hybrid approach", value: "Ensemble/Hybrid approach" },
  { label: "Rule-based + AI hybrid", value: "Rule-based + AI hybrid" },
];

export const MODEL_TRANSPARENCY_OPTIONS: OptionItem[] = [
  {
    label: "Full Transparency (Open weights, explainable)",
    value: "Full Transparency (Open weights, explainable)",
  },
  {
    label: "High (Feature importance, confidence scores)",
    value: "High (Feature importance, confidence scores)",
  },
  {
    label: "Moderate (Some explainability features)",
    value: "Moderate (Some explainability features)",
  },
  {
    label: "Limited (Black box with basic logging)",
    value: "Limited (Black box with basic logging)",
  },
  { label: "Proprietary/Closed", value: "Proprietary/Closed" },
];

export const DOCUMENTED_AI_GOVERNANCE_POLICY_OPTIONS: OptionItem[] = [
  { label: "Yes", value: "Yes" },
  { label: "No", value: "No" },
];

export const DECISION_AUTONOMY_OPTIONS: OptionItem[] = [
  {
    label: "Advisory (AI suggests, human always decides)",
    value: "Advisory (AI suggests, human always decides)",
  },
  {
    label: "Assisted (AI decides simple cases, human complex)",
    value: "Assisted (AI decides simple cases, human complex)",
  },
  {
    label: "Supervised (AI decides, human can override)",
    value: "Supervised (AI decides, human can override)",
  },
  {
    label: "Autonomous (AI decides, human monitors)",
    value: "Autonomous (AI decides, human monitors)",
  },
  {
    label: "Fully Autonomous (AI operates independently)",
    value: "Fully Autonomous (AI operates independently)",
  },
];

// ----- Compliance & Certifications -----
export const SECURITY_CERTIFICATIONS_OPTIONS: OptionItem[] = [
  { label: "SOC 2 Type 1", value: "SOC 2 Type 1" },
  { label: "SOC 2 Type 2", value: "SOC 2 Type 2" },
  { label: "ISO 27001", value: "ISO 27001" },
  { label: "ISO 42001 (AI Management)", value: "ISO 42001 (AI Management)" },
  { label: "HIPAA BAA", value: "HIPAA BAA" },
  { label: "HITRUST", value: "HITRUST" },
  { label: "FedRAMP", value: "FedRAMP" },
  { label: "PCI DSS", value: "PCI DSS" },
  { label: "GDPR Compliant", value: "GDPR Compliant" },
  { label: "CCPA Compliant", value: "CCPA Compliant" },
  { label: "None Currently", value: "None Currently" },
];

export const ASSESSMENT_COMPLETION_LEVEL_OPTIONS: OptionItem[] = [
  {
    label: "Third-party independent audit",
    value: "Third-party independent audit",
  },
  {
    label: "Third-party review (not full audit)",
    value: "Third-party review (not full audit)",
  },
  {
    label: "Internal audit by compliance team",
    value: "Internal audit by compliance team",
  },
  {
    label: "Self-reported with verification",
    value: "Self-reported with verification",
  },
  {
    label: "Self-reported without verification",
    value: "Self-reported without verification",
  },
];

export const AUDIT_FREQUENCY_OPTIONS: OptionItem[] = [
  { label: "Quarterly", value: "Quarterly" },
  { label: "Bi-annually", value: "Bi-annually" },
  { label: "Annually", value: "Annually" },
  { label: "Every 2 years", value: "Every 2 years" },
  { label: "As required by regulators/customers", value: "As required by regulators/customers" },
  { label: "Not independently audited", value: "Not independently audited" },
];

// ----- Data Handling & Privacy -----
export const PII_HANDLING_OPTIONS: OptionItem[] = [
  {
    label: "No PII (Anonymous data only)",
    value: "No PII (Anonymous data only)",
  },
  {
    label: "Minimal (Non-sensitive identifiers)",
    value: "Minimal (Non-sensitive identifiers)",
  },
  {
    label: "Moderate (Names, emails, addresses)",
    value: "Moderate (Names, emails, addresses)",
  },
  {
    label: "Extensive (Financial data, SSN, health info)",
    value: "Extensive (Financial data, SSN, health info)",
  },
  {
    label: "Critical (PHI, biometric data, children's data)",
    value: "Critical (PHI, biometric data, children's data)",
  },
];

export const DATA_RESIDENCY_OPTIONS_OPTIONS: OptionItem[] = [
  { label: "US only", value: "US only" },
  { label: "EU only", value: "EU only" },
  { label: "UK only", value: "UK only" },
  { label: "Canada only", value: "Canada only" },
  { label: "Asia-Pacific", value: "Asia-Pacific" },
  { label: "Customer choice of region", value: "Customer choice of region" },
  {
    label: "On-premise deployment available",
    value: "On-premise deployment available",
  },
  { label: "Hybrid (Cloud + On-prem)", value: "Hybrid (Cloud + On-prem)" },
];

export const DATA_RETENTION_DELETION_OPTIONS: OptionItem[] = [
  { label: "Yes", value: "Yes" },
  { label: "No", value: "No" },
];

// ----- AI Safety & Testing -----
export const BIAS_TESTING_APPROACH_OPTIONS: OptionItem[] = [
  { label: "Demographic parity testing", value: "Demographic parity testing" },
  {
    label: "Statistical bias detection tools",
    value: "Statistical bias detection tools",
  },
  {
    label: "Red team / Adversarial testing",
    value: "Red team / Adversarial testing",
  },
  { label: "Third-party bias audits", value: "Third-party bias audits" },
  {
    label: "Continuous monitoring in production",
    value: "Continuous monitoring in production",
  },
  { label: "No formal bias testing", value: "No formal bias testing" },
  { label: "Other methodology", value: "Other methodology" },
];

export const ADVERSARIAL_SECURITY_TESTING_OPTIONS: OptionItem[] = [
  {
    label: "Yes, annually by third party",
    value: "Yes, annually by third party",
  },
  { label: "Yes, internally conducted", value: "Yes, internally conducted" },
  { label: "Planned but not completed", value: "Planned but not completed" },
  { label: "No testing conducted", value: "No testing conducted" },
];

export const HUMAN_OVERSIGHT_OPTIONS: OptionItem[] = [
  {
    label: "Human-in-the-loop for all decisions",
    value: "Human-in-the-loop for all decisions",
  },
  {
    label: "Human monitoring with intervention",
    value: "Human monitoring with intervention",
  },
  {
    label: "Alert system for edge cases",
    value: "Alert system for edge cases",
  },
  { label: "Audit logs for review", value: "Audit logs for review" },
  {
    label: "Feedback mechanisms for users",
    value: "Feedback mechanisms for users",
  },
  {
    label: "No specific oversight mechanisms",
    value: "No specific oversight mechanisms",
  },
];

export const TRAINING_DATA_DOCUMENTATION_OPTIONS: OptionItem[] = [
  {
    label: "Full documentation with lineage",
    value: "Full documentation with lineage",
  },
  {
    label: "Partial documentation available",
    value: "Partial documentation available",
  },
  {
    label: "Summary only (no detailed lineage)",
    value: "Summary only (no detailed lineage)",
  },
  {
    label: "Using third-party models (data unknown)",
    value: "Using third-party models (data unknown)",
  },
  { label: "No documentation available", value: "No documentation available" },
];

// ----- Operations & Reliability -----
export const UPTIME_SLA_OPTIONS: OptionItem[] = [
  {
    label: "99.99% (52 min/year downtime)",
    value: "99.99% (52 min/year downtime)",
  },
  { label: "99.95% (4.4 hrs/year)", value: "99.95% (4.4 hrs/year)" },
  { label: "99.9% (8.8 hrs/year)", value: "99.9% (8.8 hrs/year)" },
  { label: "99.5% (1.8 days/year)", value: "99.5% (1.8 days/year)" },
  { label: "99.0% (3.7 days/year)", value: "99.0% (3.7 days/year)" },
  { label: "95.0% (18 days/year)", value: "95.0% (18 days/year)" },
  { label: "< 95% or No SLA", value: "< 95% or No SLA" },
];

export const INCIDENT_RESPONSE_PLAN_OPTIONS: OptionItem[] = [
  { label: "Yes, tested quarterly", value: "Yes, tested quarterly" },
  { label: "Yes, tested annually", value: "Yes, tested annually" },
  {
    label: "Yes, documented but not tested",
    value: "Yes, documented but not tested",
  },
  { label: "In development", value: "In development" },
  { label: "No", value: "No" },
];

export const ROLLBACK_CAPABILITY_OPTIONS: OptionItem[] = [
  { label: "Automated instant rollback", value: "Automated instant rollback" },
  {
    label: "Automated with manual trigger",
    value: "Automated with manual trigger",
  },
  {
    label: "Manual with documented procedures",
    value: "Manual with documented procedures",
  },
  {
    label: "Manual without documentation",
    value: "Manual without documentation",
  },
  { label: "No rollback capability", value: "No rollback capability" },
];

// ----- Deployment Architecture -----
export const HOSTING_DEPLOYMENT_OPTIONS: OptionItem[] = [
  {
    label: "Cloud-hosted (AWS/Azure/GCP)",
    value: "Cloud-hosted (AWS/Azure/GCP)",
  },
  {
    label: "On-premise deployment option",
    value: "On-premise deployment option",
  },
  { label: "Hybrid (Cloud + On-prem)", value: "Hybrid (Cloud + On-prem)" },
  { label: "Edge devices", value: "Edge devices" },
  {
    label: "SaaS only (single hosting option)",
    value: "SaaS only (single hosting option)",
  },
];

export const DEPLOYMENT_SCALE_OPTIONS: OptionItem[] = [
  { label: "Pilot/POC (<100 users)", value: "Pilot/POC (<100 users)" },
  {
    label: "Small Business (<1,000 users)",
    value: "Small Business (<1,000 users)",
  },
  {
    label: "Mid-Market (1,000-10,000 users)",
    value: "Mid-Market (1,000-10,000 users)",
  },
  { label: "Enterprise single-tenant", value: "Enterprise single-tenant" },
  {
    label: "Enterprise multi-tenant (10,000+ users)",
    value: "Enterprise multi-tenant (10,000+ users)",
  },
];

export const PRODUCT_STAGE_OPTIONS: OptionItem[] = [
  { label: "Design/Planning", value: "Design/Planning" },
  { label: "Development/Alpha", value: "Development/Alpha" },
  { label: "Beta Testing", value: "Beta Testing" },
  { label: "Production (< 1 year)", value: "Production (< 1 year)" },
  {
    label: "Production Mature (1+ years)",
    value: "Production Mature (1+ years)",
  },
];

// ----- Evidence & Supporting Documentation -----
export const INTERACTION_DATA_AVAILABLE_OPTIONS: OptionItem[] = [
  {
    label: "Yes, comprehensive analytics",
    value: "Yes, comprehensive analytics",
  },
  { label: "Yes, basic metrics", value: "Yes, basic metrics" },
  { label: "Limited/Partial", value: "Limited/Partial" },
  { label: "No", value: "No" },
];

export const AUDIT_LOGS_AVAILABLE_OPTIONS: OptionItem[] = [
  { label: "Yes, comprehensive", value: "Yes, comprehensive" },
  { label: "Yes, basic logging", value: "Yes, basic logging" },
  { label: "Limited/Partial", value: "Limited/Partial" },
  { label: "No", value: "No" },
];

export const TESTING_RESULTS_AVAILABLE_OPTIONS: OptionItem[] = [
  { label: "Yes, comprehensive test reports", value: "Yes, comprehensive test reports" },
  { label: "Yes, basic test results", value: "Yes, basic test results" },
  { label: "Limited/Partial", value: "Limited/Partial" },
  { label: "No formal testing conducted", value: "No formal testing conducted" },
];

/** Map: payload key -> options (for dropdown or multiselect). Used by AttestationDynamicStep. */
export const ATTESTATION_FIELD_OPTIONS: Record<string, OptionItem[]> = {
  purchase_decision_makers: PURCHASE_DECISION_MAKERS_OPTIONS,
  ai_capabilities: AI_CAPABILITIES_OPTIONS,
  ai_model_types: AI_MODEL_TYPES_OPTIONS,
  model_transparency: MODEL_TRANSPARENCY_OPTIONS,
  decision_autonomy: DECISION_AUTONOMY_OPTIONS,
  documented_ai_governance_policy: DOCUMENTED_AI_GOVERNANCE_POLICY_OPTIONS,
  security_certifications: SECURITY_CERTIFICATIONS_OPTIONS,
  assessment_completion_level: ASSESSMENT_COMPLETION_LEVEL_OPTIONS,
  audit_frequency: AUDIT_FREQUENCY_OPTIONS,
  pii_handling: PII_HANDLING_OPTIONS,
  data_residency_options: DATA_RESIDENCY_OPTIONS_OPTIONS,
  data_retention_policy: DATA_RETENTION_DELETION_OPTIONS,
  bias_testing_approach: BIAS_TESTING_APPROACH_OPTIONS,
  adversarial_security_testing: ADVERSARIAL_SECURITY_TESTING_OPTIONS,
  human_oversight: HUMAN_OVERSIGHT_OPTIONS,
  training_data_documentation: TRAINING_DATA_DOCUMENTATION_OPTIONS,
  uptime_sla: UPTIME_SLA_OPTIONS,
  incident_response_plan: INCIDENT_RESPONSE_PLAN_OPTIONS,
  rollback_capability: ROLLBACK_CAPABILITY_OPTIONS,
  hosting_deployment: HOSTING_DEPLOYMENT_OPTIONS,
  deployment_scale: DEPLOYMENT_SCALE_OPTIONS,
  product_stage: PRODUCT_STAGE_OPTIONS,
  interaction_data_available: INTERACTION_DATA_AVAILABLE_OPTIONS,
  audit_logs_available: AUDIT_LOGS_AVAILABLE_OPTIONS,
  testing_results_available: TESTING_RESULTS_AVAILABLE_OPTIONS,
};

/**
 * Get options for an attestation field by payload key (Sheet 1 Options / Validation).
 * Returns undefined for free-text fields.
 */
export function getAttestationFieldOptions(
  fieldKey: string,
): OptionItem[] | undefined {
  return ATTESTATION_FIELD_OPTIONS[fieldKey];
}
