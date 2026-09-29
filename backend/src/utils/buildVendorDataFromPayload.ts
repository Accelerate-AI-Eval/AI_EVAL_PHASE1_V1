/**
 * Build plain-text vendor data from attestation submit payload (company profile + attestation fields)
 * for the product profile generator. Mirrors frontend buildVendorDataFromFormState.
 */
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

export function buildVendorDataFromPayload(body: Record<string, unknown>): string {
  const lines: string[] = [];
  const cp = body.companyProfile && typeof body.companyProfile === "object" ? (body.companyProfile as Record<string, unknown>) : {};
  const get = (key: string) => body[key] ?? cp[key];
  const asStr = (v: unknown) => (v != null && String(v).trim() !== "" ? String(v).trim() : "");

  lines.push("Company / Vendor");
  lines.push("Vendor name: " + asStr(cp.vendorName ?? get("vendorName") ?? get("vendor_name")));
  lines.push("Vendor type: " + asStr(cp.vendorType ?? get("vendorType")));
  lines.push("Company description: " + asStr(cp.companyDescription ?? get("companyDescription")));
  lines.push("Employees: " + asStr(cp.employeeCount ?? get("employeeCount") ?? get("no_of_employees")));
  lines.push("Year founded: " + asStr(cp.yearFounded ?? get("yearFounded") ?? get("year_founded")));
  lines.push("Headquarters: " + asStr(cp.headquartersLocation ?? get("headquartersLocation") ?? get("headquarter_location")));
  const opReg = cp.operatingRegions ?? get("operatingRegions") ?? get("operate_regions");
  lines.push("Operating regions: " + formatVal(opReg));
  lines.push("Company website: " + asStr(cp.companyWebsite ?? get("companyWebsite") ?? get("company_website")));
  lines.push("Vendor maturity: " + asStr(cp.vendorMaturity ?? get("vendorMaturity") ?? get("company_stage")));
  lines.push("");

  lines.push("Product name: " + asStr(get("product_name") ?? get("productName")));
  lines.push("Purchase decision makers: " + formatVal(get("purchase_decision_makers") ?? get("purchase_decisions_by")));
  lines.push("Pain points solved: " + asStr(get("pain_points_solved") ?? get("pain_points")));
  lines.push("Alternatives considered: " + asStr(get("alternatives_considered") ?? get("alternatives_consider")));
  lines.push("Unique value proposition: " + asStr(get("unique_value_proposition") ?? get("unique_solution")));
  lines.push("Typical customer ROI: " + asStr(get("typical_customer_roi") ?? get("roi_value_metrics")));
  lines.push("AI capabilities: " + formatVal(get("ai_capabilities") ?? get("product_capabilities")));
  lines.push("AI model types: " + formatVal(get("ai_model_types") ?? get("ai_models_usage")));
  lines.push("Model transparency: " + asStr(get("model_transparency") ?? get("ai_model_transparency")));
  lines.push("Decision autonomy: " + asStr(get("decision_autonomy") ?? get("ai_autonomy_level")));
  lines.push(
    "Documented AI governance policy: " +
      asStr(get("documented_ai_governance_policy")),
  );
  lines.push("AI ethics/governance maturity: " + asStr(get("ai_ethics_governance_maturity")));
  lines.push("Versions models: " + asStr(get("versions_models")));
  lines.push("Model versioning method: " + asStr(get("model_versioning_method")));
  lines.push("Security certifications: " + formatVal(get("security_certifications") ?? get("security_compliance_certificates")));
  lines.push("Assessment completion level: " + asStr(get("assessment_completion_level") ?? get("assessment_feedback")));
  lines.push("Audit frequency: " + asStr(get("audit_frequency")));
  lines.push("HIPAA Business Associate Agreement: " + asStr(get("hipaa_baa")));
  lines.push("DPA available: " + asStr(get("dpa_available")));
  lines.push("FedRAMP authorization: " + formatVal(get("fedramp_authorization")));
  lines.push("PII handling: " + asStr(get("pii_handling") ?? get("pii_information")));
  lines.push("Privacy programme scope: " + asStr(get("privacy_programme_scope")));
  lines.push("Typical data volume: " + asStr(get("typical_data_volume")));
  lines.push("Encryption at rest: " + asStr(get("encryption_at_rest")));
  lines.push("TLS in transit: " + asStr(get("tls_in_transit")));
  lines.push(
    "Which data subject rights do you support, and in what role?: " +
      [formatVal(get("data_subject_rights")), asStr(get("controller_or_processor"))]
        .filter(Boolean)
        .join(" · "),
  );
  lines.push("Data residency options: " + formatVal(get("data_residency_options")));
  lines.push("Data retention policy: " + asStr(get("data_retention_policy")));
  lines.push("Sub-processors: " + formatVal(get("sub_processors")));
  lines.push("Vulnerability disclosure policy: " + formatVal(get("vulnerability_disclosure_policy")));
  lines.push("Bug bounty: " + formatVal(get("bug_bounty")));
  lines.push("Independent penetration test frequency: " + asStr(get("independent_pen_test_frequency")));
  lines.push("Bias testing approach: " + formatVal(get("bias_testing_approach") ?? get("bias_ai")));
  lines.push("Adversarial security testing: " + asStr(get("adversarial_security_testing") ?? get("security_testing")));
  lines.push("Human oversight: " + formatVal(get("human_oversight")));
  lines.push("Training data documentation: " + asStr(get("training_data_documentation") ?? get("training_data_document")));
  lines.push("Uptime SLA: " + asStr(get("uptime_sla") ?? get("sla_guarantee")));
  lines.push("Support SLAs by severity: " + asStr(get("support_slas")));
  lines.push("Change management / release cadence: " + asStr(get("change_management")));
  lines.push("Incident response plan: " + asStr(get("incident_response_plan")));
  lines.push(
    "Publicly disclosed security incident in the last 24 months: " +
      asStr(get("has_public_security_incident")),
  );
  lines.push("Disclosed security incidents: " + formatVal(get("security_incidents")));
  lines.push("Production model monitoring: " + asStr(get("production_model_monitoring")));
  lines.push("Critical incident response target: " + asStr(get("critical_incident_response_target")));
  lines.push("Critical incident resolution target: " + asStr(get("critical_incident_resolution_target")));
  lines.push("IR plan test frequency: " + asStr(get("ir_plan_test_frequency")));
  lines.push("Incident customer communication: " + asStr(get("incident_customer_communication")));
  lines.push("Support coverage: " + asStr(get("support_coverage")));
  lines.push("Account management: " + asStr(get("account_management")));
  lines.push("Rollback capability: " + asStr(get("rollback_capability") ?? get("rollback_deployment_issues")));
  lines.push("Hosting deployment: " + formatVal(get("hosting_deployment") ?? get("solution_hosted")));
  lines.push("Deployment scale: " + asStr(get("deployment_scale")));
  lines.push("Product stage: " + asStr(get("product_stage") ?? get("stage_product")));
  lines.push("Multi-tenant: " + asStr(get("is_multi_tenant")));
  lines.push("Tenant isolation model: " + asStr(get("tenant_isolation_model")));
  lines.push("Deployment customization: " + asStr(get("deployment_customization")));
  lines.push("Integration complexity: " + asStr(get("integration_complexity")));
  lines.push("Interaction data available: " + asStr(get("interaction_data_available") ?? get("available_usage_data")));
  lines.push("Audit logs available: " + asStr(get("audit_logs_available") ?? get("audit_logs")));
  lines.push("Testing results available: " + asStr(get("testing_results_available") ?? get("test_results")));

  return lines.filter((s) => s.length > 0).join("\n");
}