/**
 * Strip upload filenames from framework mapping `notes` for display (mirrors backend
 * `sanitizeFrameworkMappingNotes` in frameworkMappingFromCompliance.ts).
 */

const FRAMEWORK_NOTES_FILENAME_EXT =
  /\.(pdf|docx?|png|jpe?g|gif|webp|zip|txt|csv|xlsx?|pptx?|rtf|heic|tiff?)$/i;
const FRAMEWORK_NOTES_FILENAME_TOKEN =
  /\b[^\s\\/|]+\.(pdf|docx?|png|jpe?g|gif|webp|zip|txt|csv|xlsx?|pptx?|rtf|heic|tiff?)\b/i;

function segmentLooksLikeFileName(segment: string): boolean {
  const t = segment.trim();
  if (!t) return false;
  return FRAMEWORK_NOTES_FILENAME_EXT.test(t) || FRAMEWORK_NOTES_FILENAME_TOKEN.test(t);
}

function segmentIsStructured(segment: string): boolean {
  return /^(Category|Class|Expiry):/i.test(segment.trim());
}

/** Notes safe to show in framework mapping tables/cards (no PDF/document filenames). */
export function sanitizeFrameworkMappingNotesForDisplay(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return "—";

  if (segmentLooksLikeFileName(s) && !segmentIsStructured(s)) {
    return "—";
  }

  const segments = s
    .split(/\s*·\s*/)
    .flatMap((p) => p.split(/\s*\|\s*/))
    .flatMap((p) => p.split(/\r?\n/))
    .map((p) =>
      p
        .replace(
          /\b[^\s\\/|]+\.(pdf|docx?|png|jpe?g|gif|webp|zip|txt|csv|xlsx?|pptx?|rtf|heic|tiff?)\b/gi,
          "",
        )
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .filter((p) => !segmentLooksLikeFileName(p) || segmentIsStructured(p));
  const out = segments.join(" · ").trim();
  return out ? out.slice(0, 2000) : "—";
}

/**
 * After `sanitizeFrameworkMappingNotesForDisplay`, split `Category: …` from other structured/plain segments
 * (card footer shows category beside Know More; body uses `rest` only).
 */
export function splitFrameworkMappingNotesCategoryAndRest(sanitized: string): {
  category?: string;
  rest: string;
} {
  const s = String(sanitized ?? "").trim();
  if (!s || s === "—") return { rest: s || "—" };
  const parts = s.includes("·")
    ? s.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean)
    : s.split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
  let category: string | undefined;
  const rest: string[] = [];
  for (const p of parts) {
    const m = p.match(/^Category:\s*(.+)$/i);
    if (m) {
      category = m[1].trim();
      continue;
    }
    rest.push(p);
  }
  const joined = rest.join(" · ").trim();
  return { category, rest: joined || "—" };
}
