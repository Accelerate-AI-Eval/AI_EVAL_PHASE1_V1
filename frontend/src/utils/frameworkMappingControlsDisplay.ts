/**
 * Display helpers for framework mapping `controls` field: object map keyed by control id,
 * legacy JSON array, or plain text.
 */

function splitPlainControlsText(s: string): string[] {
  const t = s.trim();
  if (!t) return [];
  return t
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function linesFromParsedControls(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (item != null && typeof item === "object" && !Array.isArray(item)) {
          const o = item as Record<string, unknown>;
          const id = String(o.controlId ?? o.control_id ?? "").trim();
          const desc = String(o.description ?? "").trim();
          const title = String(o.title ?? "").trim();
          if (id && desc) return `${id}: ${desc}`;
          if (id && title) return `${id}: ${title}`;
          if (desc) return desc;
          return id || JSON.stringify(item);
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean);
  }
  if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    return Object.entries(o)
      .map(([controlId, v]) => {
        const id = String(controlId).trim();
        if (!id) return "";
        if (v == null) return "";
        if (typeof v === "string") {
          const d = v.trim();
          return d ? `${id}: ${d}` : "";
        }
        if (typeof v === "object" && !Array.isArray(v)) {
          const rec = v as Record<string, unknown>;
          const d = String(rec.description ?? "").trim();
          const t = String(rec.title ?? "").trim();
          if (d) return `${id}: ${d}`;
          if (t) return `${id}: ${t}`;
        }
        return `${id}: ${String(v)}`;
      })
      .filter(Boolean);
  }
  return [];
}

function formatControlIdWithTitle(
  id: string,
  title: string,
  description: string,
): string {
  const i = id.trim();
  const t = title.trim();
  const d = description.trim();
  if (!i) return t || d || "";
  if (t) return `${i}: ${t}`;
  if (d) return `${i}: ${d}`;
  return i;
}

/** Like `linesFromParsedControls` but prefers **title** over description next to the control id (for compact cards). */
function linesFromParsedControlsIdTitle(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => {
        if (item != null && typeof item === "object" && !Array.isArray(item)) {
          const o = item as Record<string, unknown>;
          const id = String(o.controlId ?? o.control_id ?? o.id ?? "").trim();
          const title = String(o.title ?? o.name ?? "").trim();
          const desc = String(o.description ?? "").trim();
          return formatControlIdWithTitle(id, title, desc);
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean);
  }
  if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    return Object.entries(o)
      .map(([controlId, v]) => {
        const id = String(controlId).trim();
        if (!id || v == null) return "";
        if (typeof v === "string") {
          const s = v.trim();
          return s ? formatControlIdWithTitle(id, "", s) : "";
        }
        if (typeof v === "object" && !Array.isArray(v)) {
          const rec = v as Record<string, unknown>;
          const title = String(rec.title ?? rec.name ?? "").trim();
          const desc = String(rec.description ?? "").trim();
          return formatControlIdWithTitle(id, title, desc);
        }
        return formatControlIdWithTitle(id, "", String(v));
      })
      .filter(Boolean);
  }
  return [];
}

/** Human-readable lines for table cells (e.g. `CC6.1: Description…`). */
export function frameworkControlsDisplayLines(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s === "—") return [];
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        const fromJson = linesFromParsedControls(parsed);
        if (fromJson.length > 0) return fromJson;
      } catch {
        /* fall through */
      }
    }
    return splitPlainControlsText(s);
  }
  if (typeof value === "object") {
    const fromObj = linesFromParsedControls(value);
    if (fromObj.length > 0) return fromObj;
  }
  return splitPlainControlsText(String(value));
}

/** Max controls shown / implied per framework mapping row in UI. */
export const FRAMEWORK_MAPPING_TOP_CONTROLS_MAX = 3;

const TOP_CONTROLS_LINE_PREFIX = "• ";

/**
 * Up to `max` control lines, each prefixed with a bullet (e.g. `• CC6.1: …`).
 */
export function frameworkControlsDisplayLinesTopRanked(
  value: unknown,
  max: number = FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
): string[] {
  const cap = Math.max(0, max);
  const base =
    cap === 0 ? [] : frameworkControlsDisplayLines(value).slice(0, cap);
  return base.map((line) => `${TOP_CONTROLS_LINE_PREFIX}${line}`);
}

/**
 * Framework mapping **cards**: up to `max` lines as `• {controlId}: {title}` (title preferred over long description).
 */
export function frameworkControlsDisplayLinesTopRankedForCard(
  value: unknown,
  max: number = FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
): string[] {
  const cap = Math.max(0, max);
  let base: string[] = [];

  if (value == null) return [];
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s === "—") return [];
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        const fromJson = linesFromParsedControlsIdTitle(parsed);
        if (fromJson.length > 0) base = fromJson;
      } catch {
        /* fall through */
      }
    }
    if (base.length === 0) base = splitPlainControlsText(s);
  } else if (typeof value === "object") {
    base = linesFromParsedControlsIdTitle(value);
    if (base.length === 0) base = splitPlainControlsText(String(value));
  } else {
    base = splitPlainControlsText(String(value));
  }

  const capped = cap === 0 ? [] : base.slice(0, cap);
  return capped.map((line) => `${TOP_CONTROLS_LINE_PREFIX}${line}`);
}

export type FrameworkMappingControlDetail = {
  controlId: string;
  title: string;
  description: string;
};

function descriptionFromControlRecord(rec: Record<string, unknown>): string {
  const d = String(rec.description ?? "").trim();
  if (d) return d;
  const ig = String(rec.implementationGuidance ?? "").trim();
  if (ig) return ig;
  return String(rec.text ?? rec.requirement ?? "").trim();
}

function parseJsonForControlsDetail(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s === "—") return undefined;
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  if (typeof value === "object") return value;
  return undefined;
}

/**
 * Parsed controls for modals / detail views: each entry has control id, title, and description.
 * Plain semicolon text becomes rows with description only (id/title shown as —).
 */
export function parseFrameworkMappingControlsDetail(
  value: unknown,
): FrameworkMappingControlDetail[] {
  const parsed = parseJsonForControlsDetail(value);
  const out: FrameworkMappingControlDetail[] = [];
  const dash = "—";

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const controlId = String(o.controlId ?? o.control_id ?? o.id ?? "").trim();
      const title = String(o.title ?? o.name ?? "").trim();
      const description = descriptionFromControlRecord(o);
      if (!controlId && !title && !description) continue;
      out.push({
        controlId: controlId || dash,
        title: title || dash,
        description: description || dash,
      });
    }
    return out;
  }

  if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      const controlId = String(key).trim();
      if (!controlId) continue;
      let title = "";
      let description = "";
      if (typeof val === "string") {
        description = val.trim();
      } else if (val != null && typeof val === "object" && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        title = String(rec.title ?? rec.name ?? "").trim();
        description = descriptionFromControlRecord(rec);
      } else if (val != null) {
        description = String(val).trim();
      }
      out.push({
        controlId,
        title: title || dash,
        description: description || dash,
      });
    }
    return out;
  }

  const plain = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  if (plain && plain !== "—") {
    return splitPlainControlsText(plain).map((segment) => ({
      controlId: dash,
      title: dash,
      description: segment,
    }));
  }
  return [];
}
