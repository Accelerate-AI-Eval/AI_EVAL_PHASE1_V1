import { ChevronRight, ShieldCheck } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  frameworkControlsDisplayLinesTopRankedForCard,
  FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
} from "../../utils/frameworkMappingControlsDisplay";
import { formatFrameworkMappingFrameworkForDisplay } from "../../utils/frameworkMappingFrameworkDisplay";
import {
  sanitizeFrameworkMappingNotesForDisplay,
  splitFrameworkMappingNotesCategoryAndRest,
} from "../../utils/frameworkMappingNotesDisplay";
import "./frameworkMappingCards.css";

export type FrameworkMappingCardRow = {
  framework?: unknown;
  coverage?: unknown;
  controls?: unknown;
  notes?: unknown;
};

/** Certification gap vs buyer segment (organizational portal); shown on Know More when provided. */
export type FrameworkMappingDetailCertificationGap = {
  status: "met" | "gap";
  points?: number;
  detail?: string;
  /** Display-normalized framework name from gap matrix */
  frameworkLabel?: string;
};

export type FrameworkMappingDetailFrameworkGap = {
  status: "gap";
  detail: string;
};

export type FrameworkMappingCertificationGapSourceRow = {
  framework: string;
  status: "met" | "gap";
  points?: number;
  detail?: string;
};

export type FrameworkMappingDetailLocationState = {
  row: FrameworkMappingCardRow;
  assessmentLabel?: string;
  certificationGap?: FrameworkMappingDetailCertificationGap;
  frameworkGap?: FrameworkMappingDetailFrameworkGap;
  source?: "organizational_portal";
};

function findCertificationGapForFrameworkRow(
  row: FrameworkMappingCardRow,
  gaps: FrameworkMappingCertificationGapSourceRow[] | undefined,
): FrameworkMappingDetailCertificationGap | undefined {
  if (!gaps?.length) return undefined;
  const key = formatFrameworkMappingFrameworkForDisplay(row.framework).trim().toLowerCase();
  if (!key || key === "—") return undefined;
  for (const g of gaps) {
    const gKey = formatFrameworkMappingFrameworkForDisplay(g.framework).trim().toLowerCase();
    if (gKey === key) {
      return {
        status: g.status,
        points: g.points,
        detail: g.detail,
        frameworkLabel: formatFrameworkMappingFrameworkForDisplay(g.framework),
      };
    }
  }
  return undefined;
}

function formatFrameworkCell(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s || "—";
}

const CONTROL_LINE_PREVIEW_MAX = 180;
const NOTES_PREVIEW_MAX_CHARS = 160;

function truncateLineForPreview(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function getControlsPreviewState(value: unknown): {
  previewLines: string[];
  isTruncated: boolean;
} {
  const fullLines = frameworkControlsDisplayLinesTopRankedForCard(
    value,
    FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
  );
  if (fullLines.length === 0) return { previewLines: [], isTruncated: false };
  const longLine = fullLines.some((l) => l.length > CONTROL_LINE_PREVIEW_MAX);
  const isTruncated = longLine;
  const previewLines = fullLines.map((l) => truncateLineForPreview(l, CONTROL_LINE_PREVIEW_MAX));
  return { previewLines, isTruncated };
}

function getNotesPreviewText(value: unknown): { preview: string; isTruncated: boolean } {
  const raw = sanitizeFrameworkMappingNotesForDisplay(value);
  if (!raw || raw === "—") return { preview: "", isTruncated: false };
  if (raw.length <= NOTES_PREVIEW_MAX_CHARS) return { preview: raw, isTruncated: false };
  return { preview: `${raw.slice(0, NOTES_PREVIEW_MAX_CHARS - 1)}…`, isTruncated: true };
}

function getNotesPreviewFromSanitizedString(sanitized: string): {
  preview: string;
  isTruncated: boolean;
} {
  const raw = String(sanitized ?? "").trim();
  if (!raw || raw === "—") return { preview: "", isTruncated: false };
  if (raw.length <= NOTES_PREVIEW_MAX_CHARS) return { preview: raw, isTruncated: false };
  return { preview: `${raw.slice(0, NOTES_PREVIEW_MAX_CHARS - 1)}…`, isTruncated: true };
}

function frameworkMappingRowEligibleForKnowMore(row: FrameworkMappingCardRow): boolean {
  const { previewLines } = getControlsPreviewState(row.controls);
  const { preview: notesPreview } = getNotesPreviewText(row.notes);
  if (previewLines.length > 0 || Boolean(notesPreview)) return true;

  const cov = formatFrameworkCell(row.coverage).trim().toLowerCase();
  const ctrlRaw = String(row.controls ?? "").trim().toLowerCase();
  if (cov === "not provided" || ctrlRaw === "not provided") return false;

  return false;
}

function rowHasFrameworkMappingNotProvidedGap(row: FrameworkMappingCardRow): boolean {
  const cov = formatFrameworkCell(row.coverage).trim().toLowerCase();
  const ctrl = formatFrameworkCell(row.controls).trim().toLowerCase();
  return cov === "not provided" || ctrl === "not provided";
}

export interface FrameworkMappingCardGridProps {
  rows: FrameworkMappingCardRow[];
  emptyMessage: React.ReactNode;
  assessmentLabel?: string;
  /** When set (e.g. organizational portal), matched row is passed to Know More for the gap card. */
  certificationGaps?: FrameworkMappingCertificationGapSourceRow[];
  /** Marks detail navigation as organizational portal source. */
  detailSource?: "organizational_portal";
}

/**
 * Same framework-mapping cards as Risk &amp; Controls (vendor portal): bullets, category + Know More footer, detail route.
 */
export function FrameworkMappingCardGrid({
  rows,
  emptyMessage,
  assessmentLabel,
  certificationGaps,
  detailSource,
}: FrameworkMappingCardGridProps) {
  const navigate = useNavigate();

  if (rows.length === 0) {
    return <div className="risk_mapping_empty_text">{emptyMessage}</div>;
  }

  return (
    <div className="risk_mapping_fw_grid">
      {rows.map((row, i) => {
        const fw = formatFrameworkMappingFrameworkForDisplay(row.framework);
        const cov = formatFrameworkCell(row.coverage);
        const { previewLines } = getControlsPreviewState(row.controls);
        const notesSanitized = sanitizeFrameworkMappingNotesForDisplay(row.notes);
        const { category: notesCategory, rest: notesRest } =
          splitFrameworkMappingNotesCategoryAndRest(notesSanitized);
        const { preview: notesPreview } = getNotesPreviewFromSanitizedString(notesRest);
        const certificationGap = findCertificationGapForFrameworkRow(row, certificationGaps);
        const frameworkGap =
          detailSource === "organizational_portal" && rowHasFrameworkMappingNotProvidedGap(row)
            ? {
                status: "gap" as const,
                detail:
                  "This framework was selected as a regulatory requirement on the assessment but is missing from the linked product attestation framework mapping.",
              }
            : undefined;
        const showKnowMore =
          frameworkMappingRowEligibleForKnowMore(row) ||
          certificationGap != null ||
          frameworkGap != null;
        const showCardFooter = Boolean(notesCategory) || showKnowMore;

        return (
          <article key={i} className="risk_mapping_fw_card">
            <header className="risk_mapping_fw_card_head">
              <div className="risk_mapping_fw_card_titles">
                <h4 className="risk_mapping_fw_card_framework">{fw}</h4>
                <p className="risk_mapping_fw_card_coverage">
                  <span className="risk_mapping_fw_card_label">Coverage</span>
                  <span className="risk_mapping_fw_card_coverage_value">{cov}</span>
                </p>
              </div>
            </header>

            <div className="risk_mapping_fw_card_body">
              <div className="risk_mapping_fw_card_section">
                <span className="risk_mapping_fw_card_section_label">Controls</span>
                {previewLines.length === 0 ? (
                  <span className="risk_mapping_fw_card_muted">—</span>
                ) : (
                  <ul className="risk_mapping_fw_controls_preview_list">
                    {previewLines.map((line, idx) => (
                      <li key={idx} className="risk_mapping_fw_controls_preview_item">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="risk_mapping_fw_card_section">
                <span className="risk_mapping_fw_card_section_label">Notes</span>
                {notesPreview ? (
                  <p className="risk_mapping_fw_notes_preview">{notesPreview}</p>
                ) : (
                  <span className="risk_mapping_fw_card_muted">—</span>
                )}
              </div>
            </div>

            {showCardFooter ? (
              <footer className="risk_mapping_fw_card_footer">
                <div className="risk_mapping_fw_card_footer_left">
                  {notesCategory ? (
                    <span className="risk_mapping_fw_card_category_value" title={notesCategory}>
                      <ShieldCheck
                        size={14}
                        className="risk_mapping_fw_card_category_icon"
                        aria-hidden
                      />
                      {notesCategory}
                    </span>
                  ) : null}
                </div>
                {showKnowMore ? (
                  <button
                    type="button"
                    className="risk_mapping_fw_know_more"
                    onClick={() =>
                      navigate("/riskMappings/framework-detail", {
                        state: {
                          row,
                          assessmentLabel: assessmentLabel?.trim() || undefined,
                          certificationGap,
                          frameworkGap,
                          source: detailSource,
                        } satisfies FrameworkMappingDetailLocationState,
                      })
                    }
                    aria-label={`Know more: ${fw}`}
                  >
                    Know More
                    <ChevronRight size={16} aria-hidden />
                  </button>
                ) : null}
              </footer>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
