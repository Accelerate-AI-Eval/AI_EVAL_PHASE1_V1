import {
  type FrameworkMappingTableRow,
  capFrameworkMappingControlsFieldToTopN,
  frameworkRowsFromUnknownArray,
  normalizeFrameworkMappingTableRow,
} from "./frameworkMappingFromCompliance.js";
import {
  attestationFrameworkRowsCoverRegulatoryFramework,
  getVendorCotsRegulatoryFrameworkNamesFromPayload,
} from "./vendorCotsFrameworkMappingGenerator.js";

const BUYER_COTS_TOP_CONTROLS_MAX = 3;

type FrameworkMappingRow = {
  framework?: unknown;
  coverage?: unknown;
  controls?: unknown;
  notes?: unknown;
};

function frameworkMappingRowsFromReport(rawReport: unknown): FrameworkMappingTableRow[] {
  if (!rawReport || typeof rawReport !== "object") return [];
  const reportObj = rawReport as Record<string, unknown>;
  const top = reportObj.frameworkMapping as { rows?: FrameworkMappingRow[] } | undefined;
  if (Array.isArray(top?.rows)) {
    return frameworkRowsFromUnknownArray(top.rows);
  }
  const generated = reportObj.generatedAnalysis as { fullReport?: Record<string, unknown> } | undefined;
  const nested = generated?.fullReport?.frameworkMapping as { rows?: FrameworkMappingRow[] } | undefined;
  if (!Array.isArray(nested?.rows)) return [];
  return frameworkRowsFromUnknownArray(nested.rows);
}

function buyerCotsMissingRegulatoryRow(frameworkName: string): FrameworkMappingTableRow {
  return {
    framework: frameworkName,
    coverage: "Not provided",
    controls: "Not provided",
    notes:
      "Selected in Buyer COTS regulatory requirements, but this framework is not present in vendor attestation framework mapping.",
  };
}

function capRowsToTop3Controls(rows: FrameworkMappingTableRow[]): FrameworkMappingTableRow[] {
  return rows.map((row) => {
    const normalized = normalizeFrameworkMappingTableRow(row as unknown as Record<string, unknown>);
    const cappedControls = capFrameworkMappingControlsFieldToTopN(
      normalized.framework,
      normalized.controls,
      BUYER_COTS_TOP_CONTROLS_MAX,
    );
    return { ...normalized, controls: cappedControls };
  });
}

export function buildBuyerCotsFrameworkMappingRows(
  rawReport: unknown,
  regulatoryRequirementsRaw: unknown,
): FrameworkMappingTableRow[] {
  const attestationRows = frameworkMappingRowsFromReport(rawReport);
  const requiredFrameworks = getVendorCotsRegulatoryFrameworkNamesFromPayload({
    regulatory_requirements: regulatoryRequirementsRaw,
  });

  if (requiredFrameworks.length === 0) {
    return capRowsToTop3Controls(attestationRows);
  }

  const matched = attestationRows.filter((row) =>
    requiredFrameworks.some((fw) => attestationFrameworkRowsCoverRegulatoryFramework([row], fw)),
  );
  const gaps: FrameworkMappingTableRow[] = [];
  for (const fw of requiredFrameworks) {
    if (!attestationFrameworkRowsCoverRegulatoryFramework(attestationRows, fw)) {
      gaps.push(buyerCotsMissingRegulatoryRow(fw));
    }
  }

  return capRowsToTop3Controls([...matched, ...gaps]);
}

