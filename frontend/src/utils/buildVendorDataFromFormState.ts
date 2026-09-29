/**
 * Build a plain-text vendor data block from attestation form state for the product profile generator.
 */
import type { VendorSelfAttestationFormState } from "../types/vendorSelfAttestation";

function formatVal(val: unknown): string {
  if (val == null || val === "") return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return formatVal(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed === "[object Object]" ? "" : trimmed;
  }
  if (Array.isArray(val)) return val.map((item) => formatVal(item)).filter(Boolean).join(", ");
  if (typeof val === "object") {
    const row = val as Record<string, unknown>;
    if ("summary" in row || "date" in row || "severity" in row) {
      const date = formatVal(row.date) || "Date not provided";
      const severity = formatVal(row.severity) || "unspecified severity";
      const status = row.resolved ? "resolved" : "open";
      const summary = formatVal(row.summary) || "No summary";
      const source = formatVal(row.sourceUrl ?? row.source_url);
      return `${date} — ${severity} — ${status}: ${summary}${source ? ` (${source})` : ""}`;
    }
    return Object.entries(row)
      .map(([key, item]) => {
        const text = formatVal(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(val).trim();
}

export function buildVendorDataFromFormState(formState: VendorSelfAttestationFormState | null): string {
  if (!formState) return "";

  const lines: string[] = [];
  const company = formState.companyProfile;
  const att = formState.attestation ?? {};

  lines.push("Company / Vendor");
  lines.push("Vendor name: " + formatVal(company?.vendorName));
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
  lines.push("AI ethics/governance maturity: " + formatVal(att.ai_ethics_governance_maturity));
  lines.push("Versions models: " + formatVal(att.versions_models));
  lines.push("Model versioning method: " + formatVal(att.model_versioning_method));
  lines.push("Security certifications: " + formatVal(att.security_certifications));
  lines.push("Assessment completion level: " + formatVal(att.assessment_completion_level));
  lines.push("Audit frequency: " + formatVal(att.audit_frequency));
  lines.push("HIPAA Business Associate Agreement: " + formatVal(att.hipaa_baa));
  lines.push("DPA available: " + formatVal(att.dpa_available));
  lines.push("FedRAMP authorization: " + formatVal(att.fedramp_authorization));
  lines.push("Sub-processors: " + formatVal(att.sub_processors));
  lines.push("PII handling: " + formatVal(att.pii_handling));
  lines.push("Privacy programme scope: " + formatVal(att.privacy_programme_scope));
  lines.push("Typical data volume: " + formatVal(att.typical_data_volume));
  lines.push("Encryption at rest: " + formatVal(att.encryption_at_rest));
  lines.push("TLS in transit: " + formatVal(att.tls_in_transit));
  lines.push(
    "Which data subject rights do you support, and in what role?: " +
      [formatVal(att.data_subject_rights), formatVal(att.controller_or_processor)]
        .filter(Boolean)
        .join(" · "),
  );
  lines.push("Data residency options: " + formatVal(att.data_residency_options));
  lines.push("Data retention policy: " + formatVal(att.data_retention_policy));
  lines.push("Bias testing approach: " + formatVal(att.bias_testing_approach));
  lines.push("Vulnerability disclosure policy: " + formatVal(att.vulnerability_disclosure_policy));
  lines.push("Bug bounty: " + formatVal(att.bug_bounty));
  lines.push("Independent penetration test frequency: " + formatVal(att.independent_pen_test_frequency));
  lines.push("Adversarial security testing: " + formatVal(att.adversarial_security_testing));
  lines.push("Human oversight: " + formatVal(att.human_oversight));
  lines.push("Training data documentation: " + formatVal(att.training_data_documentation));
  lines.push("Uptime SLA: " + formatVal(att.uptime_sla));
  lines.push("Support SLAs by severity: " + formatVal(att.support_slas));
  lines.push("Change management / release cadence: " + formatVal(att.change_management));
  lines.push("Incident response plan: " + formatVal(att.incident_response_plan));
  lines.push(
    "Publicly disclosed security incident in the last 24 months: " +
      formatVal(att.has_public_security_incident),
  );
  lines.push("Disclosed security incidents: " + formatVal(att.security_incidents));
  lines.push("Production model monitoring: " + formatVal(att.production_model_monitoring));
  lines.push("Critical incident response target: " + formatVal(att.critical_incident_response_target));
  lines.push("Critical incident resolution target: " + formatVal(att.critical_incident_resolution_target));
  lines.push("IR plan test frequency: " + formatVal(att.ir_plan_test_frequency));
  lines.push("Incident customer communication: " + formatVal(att.incident_customer_communication));
  lines.push("Support coverage: " + formatVal(att.support_coverage));
  lines.push("Account management: " + formatVal(att.account_management));
  lines.push("Rollback capability: " + formatVal(att.rollback_capability));
  lines.push("Hosting deployment: " + formatVal(att.hosting_deployment));
  lines.push("Deployment scale: " + formatVal(att.deployment_scale));
  lines.push("Product stage: " + formatVal(att.product_stage));
  lines.push("Multi-tenant: " + formatVal(att.is_multi_tenant));
  lines.push("Tenant isolation model: " + formatVal(att.tenant_isolation_model));
  lines.push("Deployment customization: " + formatVal(att.deployment_customization));
  lines.push("Integration complexity: " + formatVal(att.integration_complexity));
  lines.push("Interaction data available: " + formatVal(att.interaction_data_available));
  lines.push("Audit logs available: " + formatVal(att.audit_logs_available));
  lines.push("Testing results available: " + formatVal(att.testing_results_available));

  return lines.filter((s) => s.length > 0).join("\n");
}