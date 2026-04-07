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
