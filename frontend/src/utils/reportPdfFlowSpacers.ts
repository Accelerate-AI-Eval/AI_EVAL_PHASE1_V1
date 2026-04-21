import { jsPDF } from "jspdf";

export const REPORT_PDF_FLOW_SPACER_ATTR = "data-report-pdf-flow-spacer";

/**
 * Elements treated as atomic for PDF vertical slicing (html2pdf `toPdf` strips).
 * Mirrors the former `pagebreak.avoid` list — kept here so one list drives flow spacers.
 */
export const REPORT_PDF_ATOMIC_SELECTOR = [
  ".bvr_risk_block",
  ".report_section_card",
  ".report_context_panel",
  ".report_exec_brief_section",
  ".report_approval_summary_banner",
  ".bvr_card",
  ".report_risk_category_block",
  ".report_framework_notice",
  ".report_table_wrap",
  ".report_appendix_table_wrap",
  ".map_action_table_wrap",
  ".report_detail_info_grid",
  ".report_vcm_wrap > section",
  ".report_summary_body > .report_exec_brief_section",
].join(", ");

function innerHeightWidthRatio(
  marginMm: [number, number, number, number],
  jsPdfOpts: { unit?: string; format?: string | number[]; orientation?: string },
): number {
  const pdf = new jsPDF({
    unit: (jsPdfOpts.unit as "mm") ?? "mm",
    format: (jsPdfOpts.format as string | number[]) ?? "a4",
    orientation: (jsPdfOpts.orientation as "portrait") ?? "portrait",
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const innerW = pageW - marginMm[1] - marginMm[3];
  const innerH = pageH - marginMm[0] - marginMm[2];
  return innerH / innerW;
}

function yRelativeToRoot(el: HTMLElement, root: HTMLElement): { top: number; bottom: number } {
  const er = el.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  return {
    top: er.top - rr.top + root.scrollTop,
    bottom: er.bottom - rr.top + root.scrollTop,
  };
}

export function removeReportPdfFlowSpacers(root: HTMLElement): void {
  root.querySelectorAll(`[${REPORT_PDF_FLOW_SPACER_ATTR}]`).forEach((n) => n.remove());
}

/**
 * Inserts block spacers before cards that would straddle an html2pdf canvas slice,
 * using the same slice height as `Worker.prototype.toPdf`:
 * `Math.floor(canvas.width * pageSize.inner.ratio)` with `canvas.width ≈ layoutWidth * scale`.
 * Positions are root-relative (fixes html2pdf pagebreak using raw viewport rects).
 */
export function insertReportPdfFlowSpacers(
  root: HTMLElement,
  marginMm: [number, number, number, number],
  html2canvasScale: number,
  jsPdfOpts: { unit?: string; format?: string | number[]; orientation?: string },
): void {
  removeReportPdfFlowSpacers(root);
  const ratio = innerHeightWidthRatio(marginMm, jsPdfOpts);
  const layoutWidth = Math.max(1, root.scrollWidth, root.offsetWidth);
  const sliceCanvasPx = Math.floor(layoutWidth * html2canvasScale * ratio);
  if (sliceCanvasPx <= 1) return;

  const maxIters = 500;
  for (let iter = 0; iter < maxIters; iter++) {
    const nodes = root.querySelectorAll(REPORT_PDF_ATOMIC_SELECTOR);
    let fixed = false;
    for (const node of nodes) {
      const el = node as HTMLElement;
      if (!(el instanceof HTMLElement) || !root.contains(el)) continue;

      const { top, bottom } = yRelativeToRoot(el, root);
      const topC = top * html2canvasScale;
      const bottomC = bottom * html2canvasScale;
      const startSlice = Math.floor(topC / sliceCanvasPx);
      const endSlice = Math.floor((bottomC - 1e-6) / sliceCanvasPx);
      if (startSlice === endSlice) continue;
      if (bottomC - topC > sliceCanvasPx + 2) continue;

      const padC = sliceCanvasPx - (topC % sliceCanvasPx);
      const padLayout = Math.max(1, Math.ceil(padC / html2canvasScale));

      const pad = document.createElement("div");
      pad.setAttribute(REPORT_PDF_FLOW_SPACER_ATTR, "true");
      pad.style.cssText =
        "display:block;margin:0;padding:0;border:0;clear:both;width:100%;height:" +
        padLayout +
        "px;";
      el.parentNode?.insertBefore(pad, el);
      fixed = true;
      break;
    }
    if (!fixed) break;
  }
}
