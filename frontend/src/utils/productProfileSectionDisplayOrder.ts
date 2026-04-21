import type { ReportSection } from "../types/generatedProductProfile";

/**
 * Card order for generated product profile: Company reach (12) follows Company identity (2),
 * then remaining sections by product flow (not numeric id, which would place 12 after 11).
 */
export const PROFILE_SECTION_DISPLAY_ORDER = [
  1, 2, 12, 3, 4, 5, 6, 7, 8, 9, 10, 11,
] as const;

export function profileSectionDisplayRank(id: number): number {
  const order = PROFILE_SECTION_DISPLAY_ORDER as readonly number[];
  const idx = order.indexOf(id);
  if (idx !== -1) return idx;
  return order.length + id;
}

export function sortReportSectionsForDisplay(sections: ReportSection[]): ReportSection[] {
  return [...sections].sort((a, b) => profileSectionDisplayRank(a.id) - profileSectionDisplayRank(b.id));
}
