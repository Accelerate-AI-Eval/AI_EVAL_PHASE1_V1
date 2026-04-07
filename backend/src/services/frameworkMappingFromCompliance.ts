/**
 * Build report-style framework mapping rows from attestation compliance parse output
 * (compliance_document_expiries) or from stored framework_mapping_rows snapshot.
 */

import { lookupControlDescription } from "./frameworkDatasetsLoader.js";

export type FrameworkMappingTableRow = {
  framework: string;
  coverage: string;
  controls: string;
  notes: string;
};

function parseJsonValue<T = unknown>(v: unknown): T | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return undefined;
    try {
      return JSON.parse(s) as T;
    } catch {
      return undefined;
    }
  }
  return v as T;
}

const MAX_FRAMEWORK_MAPPING_CONTROLS_CHARS = 12000;
const MAX_STORED_CONTROL_DESC = 4000;

function descriptionFromControlObject(o: Record<string, unknown>): string {
  const d = String(o.description ?? "").trim();
  if (d) return d;
  const ig = String(o.implementationGuidance ?? "").trim();
  if (ig) return ig;
  return String(o.text ?? o.requirement ?? "").trim();
}

function normalizeStoredControlObjects(
  frameworkRowLabel: string,
  items: unknown[],
): Array<{
  controlId: string;
  title: string;
  description: string;
  relevanceScore?: number;
}> {
  const out: Array<{
    controlId: string;
    title: string;
    description: string;
    relevanceScore?: number;
  }> = [];
  for (const raw of items) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const controlId = String(o.controlId ?? o.control_id ?? o.id ?? "").trim();
    if (!controlId) continue;
    const title = String(o.title ?? o.name ?? "").replace(/\s+/g, " ").trim();
    let description = descriptionFromControlObject(o).replace(/\s+/g, " ").trim();
    if (!description) {
      description = lookupControlDescription(frameworkRowLabel, controlId)
        .replace(/\s+/g, " ")
        .trim();
    }
    if (description.length > MAX_STORED_CONTROL_DESC) {
      description = `${description.slice(0, MAX_STORED_CONTROL_DESC)}…`;
    }
    const relevanceScore =
      typeof o.relevanceScore === "number" ? o.relevanceScore : undefined;
    out.push({ controlId, title, description, relevanceScore });
  }
  return out;
}

/** Stored shape: `{ "<controlId>": { description, title?, relevanceScore? }, ... }`. */
export type FrameworkMappingControlsMap = Record<
  string,
  { description: string; title?: string; relevanceScore?: number }
>;

function controlsMapFromNormalized(
  normalized: Array<{
    controlId: string;
    title: string;
    description: string;
    relevanceScore?: number;
  }>,
): FrameworkMappingControlsMap {
  const out: FrameworkMappingControlsMap = {};
  for (const c of normalized) {
    if (!c.controlId) continue;
    const entry: { description: string; title?: string; relevanceScore?: number } = {
      description: c.description,
    };
    if (c.title) entry.title = c.title;
    if (typeof c.relevanceScore === "number") entry.relevanceScore = c.relevanceScore;
    out[c.controlId] = entry;
  }
  return out;
}

function normalizeControlsObjectFromRecord(
  frameworkRowLabel: string,
  raw: Record<string, unknown>,
): FrameworkMappingControlsMap {
  const out: FrameworkMappingControlsMap = {};
  for (const [key, val] of Object.entries(raw)) {
    const controlId = String(key).trim();
    if (!controlId) continue;
    let description = "";
    let title: string | undefined;
    let relevanceScore: number | undefined;
    if (typeof val === "string") {
      description = val.replace(/\s+/g, " ").trim();
    } else if (val != null && typeof val === "object" && !Array.isArray(val)) {
      const v = val as Record<string, unknown>;
      const t = String(v.title ?? "").replace(/\s+/g, " ").trim();
      title = t || undefined;
      description = descriptionFromControlObject(v).replace(/\s+/g, " ").trim();
      relevanceScore = typeof v.relevanceScore === "number" ? v.relevanceScore : undefined;
    } else {
      description = String(val ?? "").replace(/\s+/g, " ").trim();
    }
    if (!description) {
      description = lookupControlDescription(frameworkRowLabel, controlId)
        .replace(/\s+/g, " ")
        .trim();
    }
    if (description.length > MAX_STORED_CONTROL_DESC) {
      description = `${description.slice(0, MAX_STORED_CONTROL_DESC)}…`;
    }
    const entry: { description: string; title?: string; relevanceScore?: number } = {
      description: description || "—",
    };
    if (title) entry.title = title;
    if (typeof relevanceScore === "number") entry.relevanceScore = relevanceScore;
    out[controlId] = entry;
  }
  return out;
}

function stringifyControlsMap(map: FrameworkMappingControlsMap): string {
  if (Object.keys(map).length === 0) return "—";
  return JSON.stringify(map).slice(0, MAX_FRAMEWORK_MAPPING_CONTROLS_CHARS);
}

/**
 * Serialize `controls` for DB/report storage: JSON object keyed by control id, e.g.
 * `{ "PI1.1.2": { "description": "…", "title": "…" } }`. Legacy arrays are converted.
 */
export function serializeFrameworkMappingControlsField(
  frameworkRowLabel: string,
  raw: unknown,
): string {
  if (raw == null) return "—";
  if (Array.isArray(raw)) {
    const normalized = normalizeStoredControlObjects(frameworkRowLabel, raw);
    return stringifyControlsMap(controlsMapFromNormalized(normalized));
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return "—";
    const parsed = parseJsonValue<unknown>(s);
    if (Array.isArray(parsed)) {
      return serializeFrameworkMappingControlsField(frameworkRowLabel, parsed);
    }
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return stringifyControlsMap(
        normalizeControlsObjectFromRecord(frameworkRowLabel, parsed as Record<string, unknown>),
      );
    }
    return s.slice(0, MAX_FRAMEWORK_MAPPING_CONTROLS_CHARS);
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return stringifyControlsMap(
      normalizeControlsObjectFromRecord(frameworkRowLabel, raw as Record<string, unknown>),
    );
  }
  return String(raw).slice(0, MAX_FRAMEWORK_MAPPING_CONTROLS_CHARS);
}

const PLACEHOLDER_FRAMEWORK = new Set([
  "",
  "—",
  "-",
  "n/a",
  "not specified",
  "none",
  "tbd",
  "unknown",
]);

/** True if the row has a real framework name (excludes typical empty LLM / template values). */
export function isSubstantiveFrameworkMappingRow(
  r: FrameworkMappingTableRow,
): boolean {
  const fw = String(r.framework ?? "")
    .trim()
    .toLowerCase();
  if (fw.length < 2) return false;
  return !PLACEHOLDER_FRAMEWORK.has(fw);
}

export function countSubstantiveFrameworkMappingRows(
  rows: FrameworkMappingTableRow[] | null | undefined,
): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  return rows.filter(isSubstantiveFrameworkMappingRow).length;
}

function frameworkKey(r: FrameworkMappingTableRow): string {
  return String(r.framework ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Attestation rows first, then supplemental rows (e.g. LLM) without duplicating the same framework name.
 */
export function mergeFrameworkMappingRows(
  primary: FrameworkMappingTableRow[],
  secondary: FrameworkMappingTableRow[],
): FrameworkMappingTableRow[] {
  const seen = new Set<string>();
  const out: FrameworkMappingTableRow[] = [];
  for (const r of primary) {
    if (!isSubstantiveFrameworkMappingRow(r)) continue;
    const k = frameworkKey(r);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  for (const r of secondary) {
    if (!isSubstantiveFrameworkMappingRow(r)) continue;
    const k = frameworkKey(r);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Normalize loose objects (e.g. LLM JSON) into table rows. */
export function frameworkRowsFromUnknownArray(
  rows: unknown,
): FrameworkMappingTableRow[] {
  if (!Array.isArray(rows)) return [];
  const out: FrameworkMappingTableRow[] = [];
  for (const x of rows) {
    if (x == null || typeof x !== "object" || Array.isArray(x)) continue;
    const t = x as Record<string, unknown>;
    out.push(normalizeFrameworkMappingTableRow(t));
  }
  return out;
}

type ExpiryEntry = {
  category?: string;
  expiryAt?: string | null;
  documentClass?: string;
  frameworkMapping?: {
    framework: string;
    version?: string;
    controls: Array<{
      controlId: string;
      title?: string;
      description?: string;
      relevanceScore?: number;
    }>;
  };
  validation?: {
    isValid: boolean;
    reason: string;
    controlsMapped?: number;
  };
};

/** Normalize a loose framework-mapping row; ensures control JSON includes descriptions where possible. */
export function normalizeFrameworkMappingTableRow(
  r: Record<string, unknown>,
): FrameworkMappingTableRow {
  const framework = String(r.framework ?? "—").slice(0, 500);
  return {
    framework,
    coverage: String(r.coverage ?? "—").slice(0, 500),
    controls: serializeFrameworkMappingControlsField(framework, r.controls),
    notes: String(r.notes ?? "—").slice(0, 2000),
  };
}

function formatExpiryFrameworkControlsForStorage(
  fmFramework: string,
  fmVersion: string | undefined,
  controls: NonNullable<ExpiryEntry["frameworkMapping"]>["controls"],
): string {
  const rowLabel = fmVersion ? `${fmFramework} (${fmVersion})` : fmFramework;
  if (!controls?.length) return "—";
  const items = controls.map((c) => ({
    controlId: String(c.controlId ?? "").trim(),
    title: c.title,
    description: c.description,
    relevanceScore: c.relevanceScore,
  }));
  const normalized = normalizeStoredControlObjects(rowLabel, items);
  return stringifyControlsMap(controlsMapFromNormalized(normalized));
}

/** One table row per compliance PDF that has a framework mapping. */
export function buildFrameworkMappingRowsFromComplianceExpiries(
  expiries: unknown,
): FrameworkMappingTableRow[] {
  const parsed = parseJsonValue<unknown>(expiries) ?? expiries;
  if (parsed == null) return [];
  if (Array.isArray(parsed)) {
    const rows: FrameworkMappingTableRow[] = [];
    for (const raw of parsed) {
      if (raw == null || typeof raw !== "object" || Array.isArray(raw))
        continue;
      const entry = raw as ExpiryEntry & { fileName?: string };
      const fm = entry.frameworkMapping;
      if (!fm?.framework) continue;
      const fileName = String(entry.fileName ?? "document").slice(0, 500);
      const controlsText: string =
        fm.controls?.length > 0
          ? formatExpiryFrameworkControlsForStorage(fm.framework, fm.version, fm.controls)
          : "—";
      const coverage = entry.validation?.isValid
        ? "Evidence-linked controls"
        : "Partial / unverified";
      const notes = [
        fileName,
        entry.category ? `Category: ${entry.category}` : "",
        entry.documentClass ? `Class: ${entry.documentClass}` : "",
        entry.expiryAt ? `Expiry: ${entry.expiryAt}` : "",
        entry.validation?.reason ?? "",
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500);
      rows.push({
        framework: fm.version
          ? `${fm.framework} (${fm.version})`
          : fm.framework,
        coverage,
        controls: controlsText || "—",
        notes: notes || "—",
      });
    }
    return rows;
  }
  if (typeof parsed !== "object") return [];
  const rows: FrameworkMappingTableRow[] = [];
  for (const [fileName, raw] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    const entry = raw as ExpiryEntry;
    const fm = entry.frameworkMapping;
    if (!fm?.framework) continue;
    const controlsText: string =
      fm.controls?.length > 0
        ? formatExpiryFrameworkControlsForStorage(fm.framework, fm.version, fm.controls)
        : "—";
    const coverage = entry.validation?.isValid
      ? "Evidence-linked controls"
      : "Partial / unverified";
    const notes = [
      fileName,
      entry.category ? `Category: ${entry.category}` : "",
      entry.documentClass ? `Class: ${entry.documentClass}` : "",
      entry.expiryAt ? `Expiry: ${entry.expiryAt}` : "",
      entry.validation?.reason ?? "",
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);
    rows.push({
      framework: fm.version ? `${fm.framework} (${fm.version})` : fm.framework,
      coverage,
      controls: controlsText || "—",
      notes: notes || "—",
    });
  }
  return rows;
}

/**
 * Prefer persisted snapshot on the attestation; otherwise derive from compliance_document_expiries.
 */
export function resolveFrameworkMappingRowsForAttestation(
  attestation: Record<string, unknown> | null | undefined,
): FrameworkMappingTableRow[] {
  if (!attestation) return [];
  let snap = attestation.framework_mapping_rows;
  const parsedSnap = parseJsonValue<unknown[]>(snap);
  if (parsedSnap != null) snap = parsedSnap;
  if (Array.isArray(snap) && snap.length > 0) {
    return snap
      .filter(
        (x): x is Record<string, unknown> =>
          x != null && typeof x === "object" && !Array.isArray(x),
      )
      .map((x) => normalizeFrameworkMappingTableRow(x));
  }
  let exp = attestation.compliance_document_expiries;
  const parsedExp = parseJsonValue<unknown>(exp);
  if (parsedExp != null) exp = parsedExp;
  return buildFrameworkMappingRowsFromComplianceExpiries(exp);
}

/**
 * Rows already embedded in a persisted customer risk assessment report (vendor COTS Analysis Report).
 * Used when listing reports so the vendor portal can show framework mapping without a second GET.
 */
export function extractFrameworkMappingRowsFromCustomerRiskReport(
  report: unknown,
): FrameworkMappingTableRow[] {
  if (!report || typeof report !== "object") return [];
  const o = report as Record<string, unknown>;
  const top =
    parseJsonValue<unknown[]>(o.frameworkMappingRows) ?? o.frameworkMappingRows;
  if (Array.isArray(top) && top.length > 0) {
    return top
      .filter(
        (x): x is Record<string, unknown> =>
          x != null && typeof x === "object" && !Array.isArray(x),
      )
      .map((x) => normalizeFrameworkMappingTableRow(x));
  }
  const gen = o.generatedAnalysis;
  if (!gen || typeof gen !== "object") return [];
  const fr = (gen as Record<string, unknown>).fullReport;
  if (!fr || typeof fr !== "object") return [];
  const fm = (fr as Record<string, unknown>).frameworkMapping;
  if (!fm || typeof fm !== "object") return [];
  const rows = (fm as Record<string, unknown>).rows;
  const parsedRows = parseJsonValue<unknown[]>(rows) ?? rows;
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) return [];
  return parsedRows
    .filter(
      (x): x is Record<string, unknown> =>
        x != null && typeof x === "object" && !Array.isArray(x),
    )
    .map((x) => normalizeFrameworkMappingTableRow(x));
}
