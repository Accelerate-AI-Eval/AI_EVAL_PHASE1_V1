import type { GeneratedProductProfileReport, ReportSection } from "../types/generatedProductProfile";
import { sortReportSectionsForDisplay } from "./productProfileSectionDisplayOrder";

function itemText(v: unknown): string {
  if (v == null) return "Not specified";
  if (Array.isArray(v)) return v.length ? v.map((x) => String(x)).join(", ") : "Not specified";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v).trim();
  return s || "Not specified";
}

/** Legacy reports used a single section id 2 titled "Company Overview". Split into identity + reach. */
function splitLegacyCompanyOverviewIfNeeded(sections: ReportSection[]): void {
  if (sections.some((s) => s.id === 12)) return;
  const idx = sections.findIndex((s) => s.id === 2);
  if (idx === -1) return;
  const sec = sections[idx];
  const t = String(sec.title ?? "").toLowerCase();
  if (!t.includes("overview")) return;
  const items = sec.items;
  const identity: Record<string, string> = {
    "Legal Name": itemText(items["Legal Name"]),
    "Vendor Type": itemText(items["Vendor Type"]),
  };
  const reach: Record<string, string> = {
    "Year Founded": itemText(items["Year Founded"]),
    Employees: itemText(items["Employees"]),
    "Operating Regions": itemText(items["Operating Regions"]),
  };
  sections.splice(idx, 1, { id: 2, title: "Company identity", items: identity }, { id: 12, title: "Company reach", items: reach });
}

function evidenceTestingPolicyLabel(att: Record<string, unknown>): string {
  const docUploads = att.document_uploads;
  if (docUploads && typeof docUploads === "object" && !Array.isArray(docUploads)) {
    const raw = (docUploads as Record<string, unknown>).evidenceTestingPolicy;
    if (Array.isArray(raw)) {
      const names = raw
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
      if (names.length > 0) return names.join(", ");
    }
  }
  return "Not uploaded";
}

/**
 * Older stored `generated_profile_report` rows may omit sections 10 (AI Safety & Testing) and
 * 11 (Evidence & Trust). Buyer-facing views filter by visibility; merge from live attestation so
 * toggles still show current data without requiring a full profile regeneration.
 */
export function mergeMissingProfileSectionsFromAttestation(
  report: GeneratedProductProfileReport,
  attestation: Record<string, unknown> | null | undefined,
): GeneratedProductProfileReport {
  const next: ReportSection[] = [...report.sections];
  splitLegacyCompanyOverviewIfNeeded(next);

  if (!attestation) {
    next.sort((a, b) => a.id - b.id);
    return { ...report, sections: next };
  }

  const byId = new Map(next.map((s) => [s.id, s]));

  if (!byId.has(10)) {
    next.push({
      id: 10,
      title: "AI Safety & Testing",
      items: {
        "Training Data Documentation": itemText(
          attestation.training_data_documentation ?? attestation.training_data_document,
        ),
        "Bias Detection": itemText(attestation.bias_testing_approach ?? attestation.bias_ai),
        "Penetration Testing": itemText(
          attestation.adversarial_security_testing ?? attestation.security_testing,
        ),
      },
    });
  }

  if (!byId.has(11)) {
    next.push({
      id: 11,
      title: "Evidence & Trust",
      items: {
        "Usage / Interaction Telemetry": itemText(
          attestation.interaction_data_available ?? attestation.available_usage_data,
        ),
        "Audit Logs (SIEM Export)": itemText(attestation.audit_logs_available ?? attestation.audit_logs),
        "Supporting Testing and Policy Documentation": evidenceTestingPolicyLabel(attestation),
        "Model / Safety Testing Results (Under NDA)": itemText(
          attestation.testing_results_available ?? attestation.test_results,
        ),
      },
    });
  }

  splitLegacyCompanyOverviewIfNeeded(next);
  return { ...report, sections: sortReportSectionsForDisplay(next) };
}
