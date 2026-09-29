import type { GeneratedProductProfileReport, ReportSection } from "../types/generatedProductProfile";
import { sortReportSectionsForDisplay } from "./productProfileSectionDisplayOrder";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJsonIfSerialized(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "[" && trimmed[0] !== "{")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function scalarText(value: unknown): string {
  const parsed = parseJsonIfSerialized(value);
  if (parsed == null || parsed === "") return "";
  if (Array.isArray(parsed)) {
    return parsed.map((item) => scalarText(item)).filter(Boolean).join(", ");
  }
  const row = asRecord(parsed);
  if (row) {
    if ("summary" in row || "date" in row || "severity" in row) {
      return formatIncidentRow(row);
    }
    return Object.entries(row)
      .map(([key, item]) => {
        const text = scalarText(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  const text = String(parsed).trim();
  return text === "[object Object]" ? "" : text;
}

function formatIncidentRow(row: Record<string, unknown>): string {
  const date = scalarText(row.date) || "Date not provided";
  const severity = scalarText(row.severity) || "unspecified severity";
  const status = row.resolved === true || String(row.resolved ?? "").toLowerCase() === "true" || String(row.resolved ?? "").toLowerCase() === "resolved"
    ? "resolved"
    : "open";
  const summary = scalarText(row.summary) || "No summary";
  const source = scalarText(row.sourceUrl ?? row.source_url);
  return `${date} — ${severity} — ${status}: ${summary}${source ? ` (${source})` : ""}`;
}

function securityIncidentsText(answer: unknown, incidents: unknown): string {
  const parsed = parseJsonIfSerialized(incidents);
  const rows = Array.isArray(parsed)
    ? parsed
        .map((item) => asRecord(parseJsonIfSerialized(item)))
        .filter((item): item is Record<string, unknown> => item != null)
        .filter((item) => scalarText(item.summary) || scalarText(item.date))
    : [];
  if (rows.length === 0) {
    const said = scalarText(answer).toLowerCase();
    return said === "no" ? "No" : said === "yes" ? "Yes" : "Not specified";
  }
  return `Yes · ${rows.map(formatIncidentRow).join("; ")}`;
}

function itemText(v: unknown): string {
  const text = scalarText(v);
  return text || "Not specified";
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

function objectFieldsText(value: unknown, keys: string[]): string {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return "Not specified";
  const row = value as Record<string, unknown>;
  const parts = keys
    .map((key) => {
      const raw = row[key];
      return raw == null ? "" : String(raw).trim();
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not specified";
}

function subProcessorsText(value: unknown): string {
  if (!Array.isArray(value)) return "Not specified";
  const rows = value
    .map((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) return "";
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? "").trim();
      if (!name) return "";
      return [name, row.purpose, row.region, row.source_url ?? row.sourceUrl]
        .map((part) => (part == null ? "" : String(part).trim()))
        .filter(Boolean)
        .join(" — ");
    })
    .filter(Boolean);
  return rows.length ? rows.join("; ") : "Not specified";
}

function dataSubjectRightsText(rights: unknown, role: unknown): string {
  const rightsText = Array.isArray(rights)
    ? rights.map((item) => String(item).trim()).filter(Boolean).join(", ")
    : "";
  const roleText = role == null ? "" : String(role).trim();
  if (!rightsText && !roleText) return "Not specified";
  if (!rightsText) return roleText;
  if (!roleText) return rightsText;
  return `${rightsText} · ${roleText}`;
}

function privacySecurityItemsFromAttestation(att: Record<string, unknown>): Record<number, Record<string, string>> {
  return {
    6: {
      "Encryption at Rest": (() => {
        const base = itemText(att.encryption_at_rest ?? "Not disclosed");
        const evidence = itemText(att.encryption_at_rest_evidence_id);
        return evidence !== "Not specified" ? `${base} · Evidence: ${evidence}` : base;
      })(),
      "TLS in Transit": itemText(att.tls_in_transit),
      "Data Subject Rights": dataSubjectRightsText(
        att.data_subject_rights,
        att.controller_or_processor,
      ),
    },
    7: {
      "DPA Available": itemText(att.dpa_available),
    },
    9: {
      "Sub-processors": subProcessorsText(att.sub_processors),
    },
    10: {
      "Vulnerability Disclosure Policy": objectFieldsText(att.vulnerability_disclosure_policy, [
        "status",
        "url",
        "ack_sla_hours",
      ]),
      "Bug Bounty": objectFieldsText(att.bug_bounty, ["status", "url", "scope"]),
      "Independent Penetration Test Frequency": itemText(att.independent_pen_test_frequency),
    },
  };
}

function mergeItemsIntoSection(
  sections: ReportSection[],
  sectionId: number,
  title: string,
  items: Record<string, string>,
): void {
  const existing = sections.find((section) => section.id === sectionId);
  if (existing) {
    existing.items = { ...existing.items, ...items };
    return;
  }
  sections.push({ id: sectionId, title, items });
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

  const incidentLabel = "Publicly Disclosed Security Incidents (24 months)";
  const incidentText = securityIncidentsText(
    attestation.has_public_security_incident ?? attestation.hasPublicSecurityIncident,
    attestation.security_incidents ?? attestation.securityIncidents,
  );
  const security = next.find((section) => section.id === 5);
  if (security) {
    for (const key of Object.keys(security.items)) {
      if (/security incident/i.test(key)) delete security.items[key];
    }
  }
  mergeItemsIntoSection(next, 5, "Security Posture", {
    [incidentLabel]: incidentText,
  });

  const privacySecurity = privacySecurityItemsFromAttestation(attestation);
  mergeItemsIntoSection(next, 6, "Data Practices", privacySecurity[6]);
  mergeItemsIntoSection(next, 7, "Compliance & Certifications", privacySecurity[7]);
  mergeItemsIntoSection(next, 9, "Vendor Management", privacySecurity[9]);
  mergeItemsIntoSection(next, 10, "AI Safety & Testing", privacySecurity[10]);

  splitLegacyCompanyOverviewIfNeeded(next);
  return { ...report, sections: sortReportSectionsForDisplay(next) };
}
