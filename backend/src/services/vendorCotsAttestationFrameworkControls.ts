/**
 * Vendor COTS: attestation framework rows + data-folder catalogs (aiRiskDomains) → top N controls per framework.
 */

import {
  type FrameworkMappingTableRow,
  VENDOR_COTS_ATTESTATION_FRAMEWORK_MAPPING_NOT_PROVIDED_ROW,
  capFrameworkMappingControlsFieldToTopN,
  serializeFrameworkMappingControlsField,
} from "./frameworkMappingFromCompliance.js";
import {
  type AttestationControlHint,
  pickTopControlsForFrameworkAndAiDomains,
} from "./frameworkDatasetsLoader.js";
import { VENDOR_COTS_REGULATORY_GAP_COVERAGE } from "./vendorCotsFrameworkMappingGenerator.js";

const DEFAULT_CONTROLS_PER_FRAMEWORK = 3;

function parseJsonLoose(raw: unknown): unknown {
  if (raw == null) return undefined;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return undefined;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return undefined;
    }
  }
  return raw;
}

/**
 * AI risk domain names from vendor COTS `risk_domain_scores` / `riskDomainScores`, highest score first.
 */
export function parseAiRiskDomainFocusFromPayload(
  payload: Record<string, unknown>,
): string[] {
  const raw = payload.risk_domain_scores ?? payload.riskDomainScores;
  const parsed = parseJsonLoose(raw);
  type Scored = { domain: string; score: number };
  const scored: Scored[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const domain = String(o.domain ?? o.name ?? o.label ?? "").trim();
      if (!domain) continue;
      const n = Number(o.riskScore ?? o.score ?? o.value ?? 0);
      scored.push({ domain, score: Number.isFinite(n) ? n : 0 });
    }
  } else if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const domain = String(k).trim();
      if (!domain) continue;
      const n = Number(v);
      scored.push({ domain, score: Number.isFinite(n) ? n : 0 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { domain } of scored) {
    const key = domain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(domain);
  }
  return out;
}

function hasStructuredControlsField(controlsField: unknown): boolean {
  if (parseAttestationControlHints(String(controlsField ?? "")).length > 0) return true;
  const s = String(controlsField ?? "").trim();
  if (!s || s === "—") return false;
  if (!(s.startsWith("{") || s.startsWith("["))) return false;
  const parsed = parseJsonLoose(s);
  if (parsed == null) return false;
  if (Array.isArray(parsed)) {
    return parsed.some((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) return false;
      const o = item as Record<string, unknown>;
      return (
        String(o.controlId ?? o.control_id ?? o.id ?? "").trim() !== ""
      );
    });
  }
  if (typeof parsed === "object" && parsed !== null) {
    return Object.keys(parsed as Record<string, unknown>).length > 0;
  }
  return false;
}

/** First `max` segments from semicolon-separated prose controls (attestation text, not JSON). */
function topPlainSemicolonControls(controlsField: unknown, max: number): string | null {
  const s = String(controlsField ?? "").trim();
  if (!s || s === "—") return null;
  const parts = s
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const cap = Math.min(Math.max(1, max), parts.length);
  return parts.slice(0, cap).join("; ");
}

function parseAttestationControlHints(controlsField: string): AttestationControlHint[] {
  const s = String(controlsField ?? "").trim();
  if (!s || s === "—") return [];
  const parsed = parseJsonLoose(s);
  const out: AttestationControlHint[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const controlId = String(o.controlId ?? o.control_id ?? o.id ?? "").trim();
      if (!controlId) continue;
      const relevanceScore =
        typeof o.relevanceScore === "number" && Number.isFinite(o.relevanceScore)
          ? o.relevanceScore
          : undefined;
      out.push({ controlId, relevanceScore });
    }
    return out;
  }

  if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [controlId, val] of Object.entries(parsed as Record<string, unknown>)) {
      const id = String(controlId).trim();
      if (!id) continue;
      let relevanceScore: number | undefined;
      if (val != null && typeof val === "object" && !Array.isArray(val)) {
        const v = val as Record<string, unknown>;
        if (typeof v.relevanceScore === "number" && Number.isFinite(v.relevanceScore)) {
          relevanceScore = v.relevanceScore;
        }
      }
      out.push({ controlId: id, relevanceScore });
    }
  }
  return out;
}

function isVendorCotsNotProvidedMappingRow(row: FrameworkMappingTableRow): boolean {
  return (
    String(row.framework ?? "").trim() ===
      VENDOR_COTS_ATTESTATION_FRAMEWORK_MAPPING_NOT_PROVIDED_ROW.framework &&
    String(row.coverage ?? "").trim() === "Not provided"
  );
}

function isVendorCotsRegulatoryGapRow(row: FrameworkMappingTableRow): boolean {
  return String(row.coverage ?? "").trim() === VENDOR_COTS_REGULATORY_GAP_COVERAGE;
}

function withStoredControlsCappedToTopN(
  row: FrameworkMappingTableRow,
  controls: string,
  controlsPerFramework: number,
): FrameworkMappingTableRow {
  return {
    ...row,
    controls: capFrameworkMappingControlsFieldToTopN(
      row.framework,
      controls,
      controlsPerFramework,
    ),
  };
}

/**
 * For each substantive attestation framework row, keep only the top controls (default 3) with
 * controlId, title, description — chosen from the data catalog filtered by assessment AI risk domains,
 * preferring attestation-listed controls by relevance score.
 */
export function narrowVendorCotsFrameworkRowsToAiDomainControls(
  rows: FrameworkMappingTableRow[],
  payload: Record<string, unknown>,
  controlsPerFramework: number = DEFAULT_CONTROLS_PER_FRAMEWORK,
): FrameworkMappingTableRow[] {
  const focusDomains = parseAiRiskDomainFocusFromPayload(payload);
  return rows.map((row) => {
    if (isVendorCotsNotProvidedMappingRow(row) || isVendorCotsRegulatoryGapRow(row)) return row;

    if (!hasStructuredControlsField(row.controls)) {
      const plain = topPlainSemicolonControls(row.controls, controlsPerFramework);
      if (plain != null) {
        return withStoredControlsCappedToTopN({ ...row, controls: plain }, plain, controlsPerFramework);
      }
    }

    const hints = parseAttestationControlHints(row.controls);
    const slim = pickTopControlsForFrameworkAndAiDomains(
      row.framework,
      focusDomains,
      controlsPerFramework,
      hints.length > 0 ? hints : undefined,
    );
    if (slim.length === 0) {
      const plain = topPlainSemicolonControls(row.controls, controlsPerFramework);
      if (plain != null) {
        return withStoredControlsCappedToTopN({ ...row, controls: plain }, plain, controlsPerFramework);
      }
      return withStoredControlsCappedToTopN({ ...row, controls: "—" }, "—", controlsPerFramework);
    }
    const serialized = serializeFrameworkMappingControlsField(row.framework, slim);
    return withStoredControlsCappedToTopN({ ...row, controls: serialized }, serialized, controlsPerFramework);
  });
}
