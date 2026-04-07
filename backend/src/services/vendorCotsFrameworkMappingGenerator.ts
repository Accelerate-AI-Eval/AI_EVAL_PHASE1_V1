/**
 * Deterministic framework mapping rows for Vendor COTS (assessment_type cots_vendor) on submit.
 * Uses the same regulatory selections and sector normalization as the sales-risk CFR formula
 * (calcRegulatoryComplexity) so mappings align with scoring.
 */

import type { FrameworkMappingTableRow } from "./frameworkMappingFromCompliance.js";
import { getVendorCotsRegulatoryComplexitySnapshot } from "../controllers/agents/vendorCotsReportAgent.js";

/** Exact values from frontend `VENDOR_COTS_REGULATORY_REQUIREMENTS_OPTIONS`. */
const REGULATORY_OPTION_TO_ROW: Record<
  string,
  { framework: string; controls: string }
> = {
  "HIPAA (Healthcare)": {
    framework: "HIPAA",
    controls:
      "Privacy Rule & Security Rule safeguards; BAAs; PHI minimum necessary; audit & access controls",
  },
  "HITECH (Healthcare Technology)": {
    framework: "HITECH",
    controls:
      "Breach notification; enhanced enforcement; business associate accountability alongside HIPAA",
  },
  "FDA 21 CFR Part 11 (Medical Devices)": {
    framework: "FDA 21 CFR Part 11",
    controls:
      "Electronic records/signatures; validation; audit trails; access controls for regulated systems",
  },
  "SOX (Financial Reporting)": {
    framework: "SOX",
    controls:
      "IT general controls over financial reporting; change management; access to financial systems",
  },
  "GLBA (Financial Privacy)": {
    framework: "GLBA",
    controls:
      "Financial privacy notices; safeguards rule; information security program for customer data",
  },
  "PCI DSS (Payment Cards)": {
    framework: "PCI DSS",
    controls:
      "Network segmentation; encryption; access control; secure SDLC; logging & monitoring for CDE",
  },
  "FedRAMP (Federal Government)": {
    framework: "FedRAMP",
    controls:
      "NIST 800-53 based controls; continuous monitoring; ATO boundary for cloud services",
  },
  "StateRAMP (State Government)": {
    framework: "StateRAMP",
    controls:
      "State-aligned security baseline; third-party assessment; continuous monitoring",
  },
  "FISMA (Federal Systems)": {
    framework: "FISMA",
    controls:
      "System security plans; NIST RMF; agency ATO; monitoring & incident response",
  },
  "FERPA (Education Privacy)": {
    framework: "FERPA",
    controls:
      "Student education records; directory information rules; disclosure limitations",
  },
  "GDPR (EU Data Protection)": {
    framework: "GDPR",
    controls:
      "Lawful basis; DPIA where required; data subject rights; cross-border transfers & processors",
  },
  "CCPA (California Privacy)": {
    framework: "CCPA/CPRA",
    controls:
      "Consumer rights; notice at collection; service provider contracts; sensitive PI handling",
  },
  "ISO 27001 (Information Security)": {
    framework: "ISO 27001",
    controls:
      "ISMS; Annex A controls; risk treatment; internal audit & management review",
  },
  "SOC 2 (Service Organization Controls)": {
    framework: "SOC 2",
    controls:
      "Trust Services Criteria (Security, Availability, Confidentiality, etc.); vendor evidence",
  },
  "NIST AI RMF (AI Risk Management)": {
    framework: "NIST AI RMF",
    controls:
      "Govern, Map, Measure, Manage; trustworthy AI characteristics; evaluation & monitoring",
  },
};

function isExcludedRegulatorySelection(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return !t || t === "none/not applicable" || t === "none" || t === "n/a";
}

/**
 * True when the Vendor COTS assessment includes at least one substantive regulatory requirement
 * (not only None/N/A, and not Other with an empty specification).
 * Used for org-portal framework mapping: without this, engagement mapping shows "Document not provided"
 * instead of sector-implied placeholder rows.
 */
export function hasVendorCotsRegulatoryRequirementsProvided(
  payload: Record<string, unknown>,
): boolean {
  const snap = getVendorCotsRegulatoryComplexitySnapshot(payload);
  const otherText = String(
    payload.regulatory_requirements_other ?? payload.regulatoryRequirementsOther ?? "",
  ).trim();
  for (const sel of snap.regulatory) {
    if (isExcludedRegulatorySelection(sel)) continue;
    if (sel === "Other (Specify in Notes)") {
      if (otherText.length > 0) return true;
      continue;
    }
    if (REGULATORY_OPTION_TO_ROW[sel]) return true;
    if (sel.trim().length > 0) return true;
  }
  return false;
}

function sectorImpliedRows(
  sector: "Healthcare" | "Financial_Services" | "Government" | "E_Commerce" | "Technology",
): FrameworkMappingTableRow[] {
  const baseNote =
    "Vendor COTS engagement mapping (sector-implied where customer did not pick explicit frameworks).";
  switch (sector) {
    case "Healthcare":
      return [
        {
          framework: "HIPAA",
          coverage:
            "Sector-implied (Healthcare) — confirm scope with customer legal/compliance.",
          controls:
            "PHI safeguards; BAAs; minimum necessary; administrative, physical, technical controls",
          notes: baseNote,
        },
      ];
    case "Financial_Services":
      return [
        {
          framework: "SOC 2",
          coverage:
            "Sector-implied (Financial Services) — align TSC with customer procurement diligence.",
          controls:
            "Security, Availability, Confidentiality; logical access; change & incident management",
          notes: baseNote,
        },
      ];
    case "Government":
      return [
        {
          framework: "FedRAMP / FISMA",
          coverage:
            "Sector-implied (Government) — confirm FedRAMP vs StateRAMP vs agency-specific ATO.",
          controls:
            "NIST 800-53 families; continuous monitoring; boundary & data classification",
          notes: baseNote,
        },
      ];
    case "E_Commerce":
      return [
        {
          framework: "PCI DSS",
          coverage:
            "Sector-implied (Retail & e-commerce) — narrow if no cardholder data in scope.",
          controls:
            "CDE protection; encryption; access control; vulnerability management",
          notes: baseNote,
        },
      ];
    default:
      return [
        {
          framework: "NIST AI RMF",
          coverage:
            "Technology-sector AI engagement baseline — map to deployment context and governance.",
          controls:
            "Govern: policies & accountability; Map: context & risks; Measure: evaluation; Manage: monitoring",
          notes: baseNote,
        },
      ];
  }
}

function appendFormulaNotes(
  row: FrameworkMappingTableRow,
  complexityValue: number,
  requirementCount: number,
  sectorMultiplier: number,
): FrameworkMappingTableRow {
  const formulaBit = `CFR regulatory complexity (Vendor COTS formula): ${complexityValue} pts (${requirementCount} selection(s); sector weight ×${sectorMultiplier}).`;
  return {
    ...row,
    notes: `${row.notes} ${formulaBit}`.trim(),
  };
}

/**
 * Build framework table rows from assessment fields + same CFR inputs as sales-risk scoring.
 * Always returns at least one row (sector-implied or NIST AI RMF baseline) when sector is known.
 */
export function buildFrameworkMappingRowsFromVendorCotsAssessment(
  payload: Record<string, unknown>,
): FrameworkMappingTableRow[] {
  const snap = getVendorCotsRegulatoryComplexitySnapshot(payload);
  const { complexity } = snap;
  const cVal = complexity.value;
  const reqCount = complexity.regulatory_requirement_count;
  const mult = complexity.sector_complexity_multiplier;

  const otherText = String(
    payload.regulatory_requirements_other ?? payload.regulatoryRequirementsOther ?? "",
  ).trim();

  const rows: FrameworkMappingTableRow[] = [];
  const seen = new Set<string>();

  for (const sel of snap.regulatory) {
    if (isExcludedRegulatorySelection(sel)) continue;

    if (sel === "Other (Specify in Notes)") {
      const fw =
        otherText.length > 0
          ? `Customer-specified: ${otherText.slice(0, 200)}`
          : "Customer-specified (Other)";
      const key = fw.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(
        appendFormulaNotes(
          {
            framework: fw,
            coverage:
              "Stated under Regulatory requirements → Other; validate against contract and attestation.",
            controls:
              "Map to organizational policies, DPIA/AI risk assessment, and vendor evidence as applicable.",
            notes: "Vendor COTS assessment selection.",
          },
          cVal,
          reqCount,
          mult,
        ),
      );
      continue;
    }

    const mapped = REGULATORY_OPTION_TO_ROW[sel];
    if (mapped) {
      const key = mapped.framework.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(
        appendFormulaNotes(
          {
            framework: mapped.framework,
            coverage:
              "Customer-selected regulatory requirement — substantiate with product attestation and customer DPA/contract.",
            controls: mapped.controls,
            notes: "Generated on Vendor COTS submit from regulatory requirements.",
          },
          cVal,
          reqCount,
          mult,
        ),
      );
      continue;
    }

    const key = sel.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(
      appendFormulaNotes(
        {
          framework: sel.trim().slice(0, 200),
          coverage:
            "Customer-stated requirement — align to internal security & compliance catalog.",
          controls:
            "Derive control objectives from customer policy; tie to vendor SOC/ISO evidence where available.",
          notes: "Vendor COTS: non-catalog regulatory label preserved from assessment.",
        },
        cVal,
        reqCount,
        mult,
      ),
    );
  }

  if (rows.length === 0) {
    for (const r of sectorImpliedRows(snap.sector)) {
      rows.push(appendFormulaNotes(r, cVal, reqCount, mult));
    }
  }

  return rows;
}
