/**
 * Build plain-text vendor data from attestation submit payload (company profile + attestation fields)
 * for the product profile generator. Mirrors frontend buildVendorDataFromFormState.
 */
function formatVal(val) {
    if (val == null || val === "")
        return "";
    if (Array.isArray(val))
        return val.filter(Boolean).map(String).join(", ");
    if (typeof val === "object")
        return JSON.stringify(val);
    return String(val).trim();
}
export function buildVendorDataFromPayload(body) {
    const lines = [];
    const cp = body.companyProfile && typeof body.companyProfile === "object" ? body.companyProfile : {};
    const get = (key) => body[key] ?? cp[key];
    const asStr = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : "");
    lines.push("Company / Vendor");
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
    lines.push("Documented AI governance policy: " +
        asStr(get("documented_ai_governance_policy")));
    lines.push("Security certifications: " + formatVal(get("security_certifications") ?? get("security_compliance_certificates")));
    lines.push("Assessment completion level: " + asStr(get("assessment_completion_level") ?? get("assessment_feedback")));
    lines.push("Audit frequency: " + asStr(get("audit_frequency")));
    lines.push("PII handling: " + asStr(get("pii_handling") ?? get("pii_information")));
    lines.push("Data residency options: " + formatVal(get("data_residency_options")));
    lines.push("Data retention policy: " + asStr(get("data_retention_policy")));
    lines.push("Bias testing approach: " + formatVal(get("bias_testing_approach") ?? get("bias_ai")));
    lines.push("Adversarial security testing: " + asStr(get("adversarial_security_testing") ?? get("security_testing")));
    lines.push("Human oversight: " + formatVal(get("human_oversight")));
    lines.push("Training data documentation: " + asStr(get("training_data_documentation") ?? get("training_data_document")));
    lines.push("Uptime SLA: " + asStr(get("uptime_sla") ?? get("sla_guarantee")));
    lines.push("Support SLAs by severity: " + asStr(get("support_slas")));
    lines.push("Change management / release cadence: " + asStr(get("change_management")));
    lines.push("Incident response plan: " + asStr(get("incident_response_plan")));
    lines.push("Rollback capability: " + asStr(get("rollback_capability") ?? get("rollback_deployment_issues")));
    lines.push("Hosting deployment: " + formatVal(get("hosting_deployment") ?? get("solution_hosted")));
    lines.push("Deployment scale: " + asStr(get("deployment_scale")));
    lines.push("Product stage: " + asStr(get("product_stage") ?? get("stage_product")));
    lines.push("Interaction data available: " + asStr(get("interaction_data_available") ?? get("available_usage_data")));
    lines.push("Audit logs available: " + asStr(get("audit_logs_available") ?? get("audit_logs")));
    lines.push("Testing results available: " + asStr(get("testing_results_available") ?? get("test_results")));
    return lines.filter((s) => s.length > 0).join("\n");
}
