/**
 * Build a plain-text vendor data block from attestation form state for the product profile generator.
 */
import type { VendorSelfAttestationFormState } from "../types/vendorSelfAttestation";

function formatVal(val: unknown): string {
  if (val == null || val === "") return "";
  if (Array.isArray(val)) return val.filter(Boolean).join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val).trim();
}

export function buildVendorDataFromFormState(formState: VendorSelfAttestationFormState | null): string {
  if (!formState) return "";

  const lines: string[] = [];
  const company = formState.companyProfile;
  const att = formState.attestation ?? {};

  lines.push("Company / Vendor");
  lines.push("Vendor type: " + formatVal(company?.vendorType));
  lines.push("Company description: " + formatVal(company?.companyDescription));
  lines.push("Employees: " + formatVal(company?.employeeCount));
  lines.push("Year founded: " + formatVal(company?.yearFounded));
  lines.push("Headquarters: " + formatVal(company?.headquartersLocation));
  lines.push("Operating regions: " + formatVal(company?.operatingRegions));
  lines.push("Company website: " + formatVal(company?.companyWebsite));
  lines.push("Vendor maturity: " + formatVal(company?.vendorMaturity));
  lines.push("");

  lines.push("Product name: " + formatVal(att.product_name));
  lines.push("Purchase decision makers: " + formatVal(att.purchase_decision_makers));
  lines.push("Pain points solved: " + formatVal(att.pain_points_solved));
  lines.push("Alternatives considered: " + formatVal(att.alternatives_considered));
  lines.push("Unique value proposition: " + formatVal(att.unique_value_proposition));
  lines.push("Typical customer ROI: " + formatVal(att.typical_customer_roi));
  lines.push("AI capabilities: " + formatVal(att.ai_capabilities));
  lines.push("AI model types: " + formatVal(att.ai_model_types));
  lines.push("Model transparency: " + formatVal(att.model_transparency));
  lines.push("Decision autonomy: " + formatVal(att.decision_autonomy));
  lines.push("Security certifications: " + formatVal(att.security_certifications));
  lines.push("Assessment completion level: " + formatVal(att.assessment_completion_level));
  lines.push("Audit frequency: " + formatVal(att.audit_frequency));
  lines.push("PII handling: " + formatVal(att.pii_handling));
  lines.push("Data residency options: " + formatVal(att.data_residency_options));
  lines.push("Data retention policy: " + formatVal(att.data_retention_policy));
  lines.push("Bias testing approach: " + formatVal(att.bias_testing_approach));
  lines.push("Adversarial security testing: " + formatVal(att.adversarial_security_testing));
  lines.push("Human oversight: " + formatVal(att.human_oversight));
  lines.push("Training data documentation: " + formatVal(att.training_data_documentation));
  lines.push("Uptime SLA: " + formatVal(att.uptime_sla));
  lines.push("Support SLAs by severity: " + formatVal(att.support_slas));
  lines.push("Change management / release cadence: " + formatVal(att.change_management));
  lines.push("Incident response plan: " + formatVal(att.incident_response_plan));
  lines.push("Rollback capability: " + formatVal(att.rollback_capability));
  lines.push("Hosting deployment: " + formatVal(att.hosting_deployment));
  lines.push("Deployment scale: " + formatVal(att.deployment_scale));
  lines.push("Product stage: " + formatVal(att.product_stage));
  lines.push("Interaction data available: " + formatVal(att.interaction_data_available));
  lines.push("Audit logs available: " + formatVal(att.audit_logs_available));
  lines.push("Testing results available: " + formatVal(att.testing_results_available));

  return lines.filter((s) => s.length > 0).join("\n");
}
