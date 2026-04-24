/**
 * Build report-style framework mapping rows from attestation compliance parse output
 * (compliance_document_expiries) or from stored framework_mapping_rows snapshot.
 */
import { lookupControlDescription } from "./frameworkDatasetsLoader.js";
function parseJsonValue(v) {
    if (v == null)
        return undefined;
    if (typeof v === "string") {
        const s = v.trim();
        if (!s)
            return undefined;
        try {
            return JSON.parse(s);
        }
        catch {
            return undefined;
        }
    }
    return v;
}
const MAX_FRAMEWORK_MAPPING_CONTROLS_CHARS = 12000;
const MAX_STORED_CONTROL_DESC = 4000;
/** User-visible framework column: omit redundant SOC 2 (2017) trust-criteria year. */
function frameworkMappingFrameworkColumnFromParts(framework, version) {
    const fw = String(framework ?? "").trim();
    const ver = String(version ?? "").trim();
    if (!ver)
        return fw;
    if (/^soc\s*2$/i.test(fw.replace(/\s+/g, " ")) && ver === "2017")
        return fw;
    return `${fw} (${ver})`;
}
function stripSoc2TrustCriteriaYearFromFrameworkLabel(label) {
    let s = String(label ?? "").trim().replace(/\s+/g, " ");
    if (!s || s === "—")
        return s;
    s = s.replace(/^SOC\s*2\s*\(\s*2017\s*\)/i, "SOC 2");
    return s.replace(/\s+/g, " ").trim();
}
function descriptionFromControlObject(o) {
    const d = String(o.description ?? "").trim();
    if (d)
        return d;
    const ig = String(o.implementationGuidance ?? "").trim();
    if (ig)
        return ig;
    return String(o.text ?? o.requirement ?? "").trim();
}
function normalizeStoredControlObjects(frameworkRowLabel, items) {
    const out = [];
    for (const raw of items) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw))
            continue;
        const o = raw;
        const controlId = String(o.controlId ?? o.control_id ?? o.id ?? "").trim();
        if (!controlId)
            continue;
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
        const relevanceScore = typeof o.relevanceScore === "number" ? o.relevanceScore : undefined;
        out.push({ controlId, title, description, relevanceScore });
    }
    return out;
}
function controlsMapFromNormalized(normalized) {
    const out = {};
    for (const c of normalized) {
        if (!c.controlId)
            continue;
        const entry = {
            description: c.description,
        };
        if (c.title)
            entry.title = c.title;
        if (typeof c.relevanceScore === "number")
            entry.relevanceScore = c.relevanceScore;
        out[c.controlId] = entry;
    }
    return out;
}
function normalizeControlsObjectFromRecord(frameworkRowLabel, raw) {
    const out = {};
    for (const [key, val] of Object.entries(raw)) {
        const controlId = String(key).trim();
        if (!controlId)
            continue;
        let description = "";
        let title;
        let relevanceScore;
        if (typeof val === "string") {
            description = val.replace(/\s+/g, " ").trim();
        }
        else if (val != null && typeof val === "object" && !Array.isArray(val)) {
            const v = val;
            const t = String(v.title ?? "").replace(/\s+/g, " ").trim();
            title = t || undefined;
            description = descriptionFromControlObject(v).replace(/\s+/g, " ").trim();
            relevanceScore = typeof v.relevanceScore === "number" ? v.relevanceScore : undefined;
        }
        else {
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
        const entry = {
            description: description || "—",
        };
        if (title)
            entry.title = title;
        if (typeof relevanceScore === "number")
            entry.relevanceScore = relevanceScore;
        out[controlId] = entry;
    }
    return out;
}
function stringifyControlsMap(map) {
    if (Object.keys(map).length === 0)
        return "—";
    return JSON.stringify(map).slice(0, MAX_FRAMEWORK_MAPPING_CONTROLS_CHARS);
}
/** Default max control entries persisted per framework mapping row (Vendor COTS reports, etc.). */
export const FRAMEWORK_MAPPING_STORED_CONTROLS_MAX = 3;
/**
 * Keep at most `maxControls` entries when the `controls` field is JSON (object or array).
 * Plain semicolon-separated text is returned unchanged. Used so stored reports only retain top N controls.
 */
export function capFrameworkMappingControlsFieldToTopN(frameworkRowLabel, controlsField, maxControls = FRAMEWORK_MAPPING_STORED_CONTROLS_MAX) {
    const s = String(controlsField ?? "").trim();
    if (!s || s === "—")
        return s;
    const cap = Math.min(99, Math.max(1, maxControls));
    if (!(s.startsWith("{") || s.startsWith("["))) {
        const segments = s
            .split(";")
            .map((part) => part.trim())
            .filter(Boolean);
        if (segments.length <= cap)
            return s;
        return segments.slice(0, cap).join("; ");
    }
    const parsed = parseJsonValue(s);
    if (parsed == null)
        return s;
    if (Array.isArray(parsed)) {
        const normalized = normalizeStoredControlObjects(frameworkRowLabel, parsed);
        const capped = normalized.slice(0, cap);
        if (capped.length === 0)
            return s;
        return stringifyControlsMap(controlsMapFromNormalized(capped));
    }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const map = normalizeControlsObjectFromRecord(frameworkRowLabel, parsed);
        const entries = Object.entries(map).slice(0, cap);
        if (entries.length === 0)
            return s;
        const capped = {};
        for (const [k, v] of entries) {
            capped[k] = v;
        }
        return stringifyControlsMap(capped);
    }
    return s;
}
/**
 * Serialize `controls` for DB/report storage: JSON object keyed by control id, e.g.
 * `{ "PI1.1.2": { "description": "…", "title": "…" } }`. Legacy arrays are converted.
 */
export function serializeFrameworkMappingControlsField(frameworkRowLabel, raw) {
    if (raw == null)
        return "—";
    if (Array.isArray(raw)) {
        const normalized = normalizeStoredControlObjects(frameworkRowLabel, raw);
        return stringifyControlsMap(controlsMapFromNormalized(normalized));
    }
    if (typeof raw === "string") {
        const s = raw.trim();
        if (!s)
            return "—";
        const parsed = parseJsonValue(s);
        if (Array.isArray(parsed)) {
            return serializeFrameworkMappingControlsField(frameworkRowLabel, parsed);
        }
        if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
            return stringifyControlsMap(normalizeControlsObjectFromRecord(frameworkRowLabel, parsed));
        }
        return s.slice(0, MAX_FRAMEWORK_MAPPING_CONTROLS_CHARS);
    }
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        return stringifyControlsMap(normalizeControlsObjectFromRecord(frameworkRowLabel, raw));
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
export function isSubstantiveFrameworkMappingRow(r) {
    const fw = String(r.framework ?? "")
        .trim()
        .toLowerCase();
    if (fw.length < 2)
        return false;
    return !PLACEHOLDER_FRAMEWORK.has(fw);
}
export function countSubstantiveFrameworkMappingRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0)
        return 0;
    return rows.filter(isSubstantiveFrameworkMappingRow).length;
}
function frameworkKey(r) {
    return String(r.framework ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}
/**
 * Attestation rows first, then supplemental rows (e.g. LLM) without duplicating the same framework name.
 */
export function mergeFrameworkMappingRows(primary, secondary) {
    const seen = new Set();
    const out = [];
    for (const r of primary) {
        if (!isSubstantiveFrameworkMappingRow(r))
            continue;
        const k = frameworkKey(r);
        if (!k || seen.has(k))
            continue;
        seen.add(k);
        out.push(r);
    }
    for (const r of secondary) {
        if (!isSubstantiveFrameworkMappingRow(r))
            continue;
        const k = frameworkKey(r);
        if (!k || seen.has(k))
            continue;
        seen.add(k);
        out.push(r);
    }
    return out;
}
/**
 * Same merge as the customer risk reports list: attestation-derived rows first,
 * then supplemental rows from the stored analysis report (e.g. regulatory gap “Not provided”).
 */
export function vendorCotsFrameworkMappingRowsForListView(attestation, storedReport) {
    const fromAttestation = resolveFrameworkMappingRowsForAttestation(attestation ?? undefined);
    const fromStoredReport = extractFrameworkMappingRowsFromCustomerRiskReport(storedReport);
    const merged = mergeFrameworkMappingRows(fromAttestation, fromStoredReport);
    if (merged.length > 0)
        return merged;
    if (fromAttestation.length > 0)
        return fromAttestation;
    return fromStoredReport;
}
/** Normalize loose objects (e.g. LLM JSON) into table rows. */
export function frameworkRowsFromUnknownArray(rows) {
    if (!Array.isArray(rows))
        return [];
    const out = [];
    for (const x of rows) {
        if (x == null || typeof x !== "object" || Array.isArray(x))
            continue;
        const t = x;
        out.push(normalizeFrameworkMappingTableRow(t));
    }
    return out;
}
const FRAMEWORK_NOTES_FILENAME_EXT = /\.(pdf|docx?|png|jpe?g|gif|webp|zip|txt|csv|xlsx?|pptx?|rtf|heic|tiff?)$/i;
/** True when a notes segment is an upload / document filename (not structured metadata like `Category:`). */
function frameworkNotesSegmentLooksLikeFileName(segment) {
    const t = segment.trim();
    if (!t)
        return false;
    if (FRAMEWORK_NOTES_FILENAME_EXT.test(t))
        return true;
    return false;
}
function frameworkNotesSegmentIsStructured(segment) {
    return /^(Category|Class|Expiry):/i.test(segment.trim());
}
/**
 * Drop filename-only notes and any segment that looks like `…FINAL.pdf`, whether separated by ·, |, or newlines.
 */
function sanitizeFrameworkMappingNotes(raw) {
    const s = String(raw ?? "").trim();
    if (!s || s === "—")
        return "—";
    if (frameworkNotesSegmentLooksLikeFileName(s) && !frameworkNotesSegmentIsStructured(s)) {
        return "—";
    }
    const segments = s
        .split(/\s*·\s*/)
        .flatMap((p) => p.split(/\s*\|\s*/))
        .flatMap((p) => p.split(/\r?\n/))
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !frameworkNotesSegmentLooksLikeFileName(p) ||
        frameworkNotesSegmentIsStructured(p));
    const out = segments.join(" · ").trim();
    return out ? out.slice(0, 2000) : "—";
}
/** Normalize a loose framework-mapping row; ensures control JSON includes descriptions where possible. */
export function normalizeFrameworkMappingTableRow(r) {
    const rawFw = String(r.framework ?? "—").slice(0, 500);
    const framework = stripSoc2TrustCriteriaYearFromFrameworkLabel(rawFw).slice(0, 500) || "—";
    return {
        framework,
        coverage: String(r.coverage ?? "—").slice(0, 500),
        controls: serializeFrameworkMappingControlsField(framework, r.controls),
        notes: sanitizeFrameworkMappingNotes(String(r.notes ?? "—")),
    };
}
function formatExpiryFrameworkControlsForStorage(fmFramework, fmVersion, controls) {
    const rowLabel = fmVersion ? `${fmFramework} (${fmVersion})` : fmFramework;
    if (!controls?.length)
        return "—";
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
export function buildFrameworkMappingRowsFromComplianceExpiries(expiries) {
    const parsed = parseJsonValue(expiries) ?? expiries;
    if (parsed == null)
        return [];
    if (Array.isArray(parsed)) {
        const rows = [];
        for (const raw of parsed) {
            if (raw == null || typeof raw !== "object" || Array.isArray(raw))
                continue;
            const entry = raw;
            const fm = entry.frameworkMapping;
            if (!fm?.framework)
                continue;
            const controlsText = fm.controls?.length > 0
                ? formatExpiryFrameworkControlsForStorage(fm.framework, fm.version, fm.controls)
                : "—";
            const coverage = entry.validation?.isValid
                ? "Evidence-linked controls"
                : "Partial / unverified";
            const notes = [
                entry.category ? `Category: ${entry.category}` : "",
                entry.documentClass ? `Class: ${entry.documentClass}` : "",
                entry.expiryAt ? `Expiry: ${entry.expiryAt}` : "",
                entry.validation?.reason ?? "",
            ]
                .filter(Boolean)
                .join(" · ")
                .slice(0, 500);
            rows.push({
                framework: frameworkMappingFrameworkColumnFromParts(String(fm.framework), fm.version),
                coverage,
                controls: controlsText || "—",
                notes: notes || "—",
            });
        }
        return rows;
    }
    if (typeof parsed !== "object")
        return [];
    const rows = [];
    for (const [, raw] of Object.entries(parsed)) {
        const entry = raw;
        const fm = entry.frameworkMapping;
        if (!fm?.framework)
            continue;
        const controlsText = fm.controls?.length > 0
            ? formatExpiryFrameworkControlsForStorage(fm.framework, fm.version, fm.controls)
            : "—";
        const coverage = entry.validation?.isValid
            ? "Evidence-linked controls"
            : "Partial / unverified";
        const notes = [
            entry.category ? `Category: ${entry.category}` : "",
            entry.documentClass ? `Class: ${entry.documentClass}` : "",
            entry.expiryAt ? `Expiry: ${entry.expiryAt}` : "",
            entry.validation?.reason ?? "",
        ]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 500);
        rows.push({
            framework: frameworkMappingFrameworkColumnFromParts(String(fm.framework), fm.version),
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
export function resolveFrameworkMappingRowsForAttestation(attestation) {
    if (!attestation)
        return [];
    let snap = attestation.framework_mapping_rows;
    const parsedSnap = parseJsonValue(snap);
    if (parsedSnap != null)
        snap = parsedSnap;
    if (Array.isArray(snap) && snap.length > 0) {
        return snap
            .filter((x) => x != null && typeof x === "object" && !Array.isArray(x))
            .map((x) => normalizeFrameworkMappingTableRow(x));
    }
    let exp = attestation.compliance_document_expiries;
    const parsedExp = parseJsonValue(exp);
    if (parsedExp != null)
        exp = parsedExp;
    return buildFrameworkMappingRowsFromComplianceExpiries(exp);
}
/** Vendor COTS (type 2): single placeholder when linked attestation has no compliance framework mapping. */
export const VENDOR_COTS_ATTESTATION_FRAMEWORK_MAPPING_NOT_PROVIDED_ROW = {
    framework: "Compliance framework mapping",
    coverage: "Not provided",
    controls: "Not provided",
    notes: "No compliance framework mapping was provided on the linked product attestation.",
};
/**
 * Vendor COTS framework mapping uses only the linked product attestation (compliance parse / snapshot).
 * If there is no attestation data or no substantive mapping rows, returns one "Not provided" row.
 */
export function vendorCotsFrameworkMappingRowsFromAttestation(attestation) {
    if (!attestation) {
        return [{ ...VENDOR_COTS_ATTESTATION_FRAMEWORK_MAPPING_NOT_PROVIDED_ROW }];
    }
    const substantive = resolveFrameworkMappingRowsForAttestation(attestation).filter(isSubstantiveFrameworkMappingRow);
    if (substantive.length === 0) {
        return [{ ...VENDOR_COTS_ATTESTATION_FRAMEWORK_MAPPING_NOT_PROVIDED_ROW }];
    }
    return substantive;
}
/**
 * Rows already embedded in a persisted customer risk assessment report (vendor COTS Analysis Report).
 * Used when listing reports so the vendor portal can show framework mapping without a second GET.
 */
export function extractFrameworkMappingRowsFromCustomerRiskReport(report) {
    if (!report || typeof report !== "object")
        return [];
    const o = report;
    const top = parseJsonValue(o.frameworkMappingRows) ?? o.frameworkMappingRows;
    if (Array.isArray(top) && top.length > 0) {
        return top
            .filter((x) => x != null && typeof x === "object" && !Array.isArray(x))
            .map((x) => normalizeFrameworkMappingTableRow(x));
    }
    const gen = o.generatedAnalysis;
    if (!gen || typeof gen !== "object")
        return [];
    const fr = gen.fullReport;
    if (!fr || typeof fr !== "object")
        return [];
    const fm = fr.frameworkMapping;
    if (!fm || typeof fm !== "object")
        return [];
    const rows = fm.rows;
    const parsedRows = parseJsonValue(rows) ?? rows;
    if (!Array.isArray(parsedRows) || parsedRows.length === 0)
        return [];
    return parsedRows
        .filter((x) => x != null && typeof x === "object" && !Array.isArray(x))
        .map((x) => normalizeFrameworkMappingTableRow(x));
}
