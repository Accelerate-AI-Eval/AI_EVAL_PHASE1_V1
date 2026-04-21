import html2pdf from "html2pdf.js";
import { jsPDF } from "jspdf";
import "../styles/reportPdfCapture.css";
import { insertReportPdfFlowSpacers, removeReportPdfFlowSpacers } from "./reportPdfFlowSpacers";

/** Share of sampled pixels that may be non-white before the last slice is considered "real" content. */
const PDF_TRAILING_SLICE_MAX_NONWHITE = 0.0025;

/** Safe single segment for a downloaded PDF filename (no path chars). */
export function sanitizePdfSlug(raw: string, maxLen = 48): string {
  const t = String(raw ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\.+$/g, "")
    .trim();
  if (!t) return "";
  return t
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
}

/**
 * Filename: report name, organization, product (in that order), `.pdf`.
 * PDF document metadata title is set to the same stem without extension.
 */
export function buildReportPdfFilename(parts: {
  reportName: string;
  orgName: string;
  productName: string;
}): string {
  const reportName = sanitizePdfSlug(parts.reportName, 44) || "Report";
  const orgName = sanitizePdfSlug(parts.orgName, 44);
  const productName = sanitizePdfSlug(parts.productName, 44);
  const segments = [reportName, orgName, productName].filter((s) => s.length > 0);
  return `${segments.join("-")}.pdf`;
}

/** Strip "Analysis Report: " then split "Org - Product" from stored report titles. */
export function splitCompleteReportTitle(title: string): { org: string; product: string } {
  const cleaned = String(title ?? "")
    .replace(/^Analysis Report:\s*/i, "")
    .trim();
  const idx = cleaned.indexOf(" - ");
  if (idx >= 0) {
    return {
      org: cleaned.slice(0, idx).trim(),
      product: cleaned.slice(idx + 3).trim(),
    };
  }
  return { org: cleaned, product: "" };
}

/** Parse assessment labels like "Org - Product" or "Org and Product". */
export function splitAssessmentLabelForPdf(label: string): { org: string; product: string } {
  const s = String(label ?? "").trim();
  if (!s) return { org: "", product: "" };
  const dashParts = s.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return { org: dashParts[0] ?? "", product: dashParts.slice(1).join("-") };
  }
  const andParts = s.split(/\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  if (andParts.length >= 2) {
    return { org: andParts[0] ?? "", product: andParts.slice(1).join("-and-") };
  }
  return { org: s, product: "" };
}

/**
 * html2pdf splits the canvas with `ceil(height / sliceHeight)`, so a tall canvas whose
 * last slice is only background often becomes an extra full blank PDF page. Detect that
 * slice on the source canvas (before JPEG) and drop the last jsPDF page when it is empty.
 */
function isTrailingCanvasSliceMostlyBlank(canvas: HTMLCanvasElement, pxPageHeight: number): boolean {
  const pxFullHeight = canvas.height;
  const nPages = Math.ceil(pxFullHeight / pxPageHeight);
  if (nPages < 2 || pxPageHeight < 8) return false;

  const lastTop = (nPages - 1) * pxPageHeight;
  const lastH = Math.min(pxPageHeight, pxFullHeight - lastTop);
  if (lastH < 4) return true;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  let img: ImageData;
  try {
    img = ctx.getImageData(0, lastTop, canvas.width, lastH);
  } catch {
    return false;
  }

  const d = img.data;
  const w = canvas.width;
  const step = 6;
  const rgbTol = 14;
  let sampled = 0;
  let nonWhite = 0;
  for (let sy = 0; sy < lastH; sy += step) {
    for (let sx = 0; sx < w; sx += step) {
      const i = (sy * w + sx) * 4;
      const r = d[i] ?? 255;
      const g = d[i + 1] ?? 255;
      const b = d[i + 2] ?? 255;
      sampled++;
      if (r < 255 - rgbTol || g < 255 - rgbTol || b < 255 - rgbTol) nonWhite++;
    }
  }
  return nonWhite / Math.max(1, sampled) < PDF_TRAILING_SLICE_MAX_NONWHITE;
}

function deleteTrailingBlankPdfPageIfNeeded(
  pdf: InstanceType<typeof jsPDF>,
  canvas: HTMLCanvasElement,
  innerRatio: number,
): void {
  const pxPageHeight = Math.floor(canvas.width * innerRatio);
  if (pdf.getNumberOfPages() < 2) return;
  if (!isTrailingCanvasSliceMostlyBlank(canvas, pxPageHeight)) return;
  pdf.deletePage(pdf.getNumberOfPages());
}

/** Renders the given element to a PDF and triggers a browser download. */
export async function downloadElementAsPdf(element: HTMLElement, filename: string): Promise<void> {
  removeReportPdfFlowSpacers(element);
  element.classList.add("report_pdf_capture");
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const marginMm = [8, 8, 10, 8] as [number, number, number, number];
  const html2canvasScale = 2;
  const jsPdfOpts = {
    unit: "mm",
    format: "a4",
    orientation: "portrait" as const,
  };

  insertReportPdfFlowSpacers(element, marginMm, html2canvasScale, jsPdfOpts);

  const opt = {
    margin: marginMm,
    filename,
    image: { type: "jpeg" as const, quality: 0.94 },
    html2canvas: {
      scale: html2canvasScale,
      useCORS: true,
      logging: false,
      scrollY: -window.scrollY,
      scrollX: 0,
      windowWidth: element.scrollWidth,
      letterRendering: true,
    },
    jsPDF: jsPdfOpts,
    /**
     * Built-in pagebreak uses viewport rects without subtracting the container offset
     * (see html2pdf `pagebreaks.js`), which splits cards when the capture root is scaled.
     * Custom spacers in `insertReportPdfFlowSpacers` use root-relative Y and the same
     * slice height as `toPdf` (`floor(canvas.width * inner.ratio)`).
     */
    pagebreak: {
      mode: [] as string[],
      before: [] as string[],
      after: [] as string[],
      avoid: [] as string[],
    },
  };

  try {
    const worker = html2pdf().set(opt).from(element);
    await worker.toPdf();
    const pdf = (await worker.get("pdf")) as InstanceType<typeof jsPDF>;
    const canvas = (await worker.get("canvas")) as HTMLCanvasElement;
    const pageSize = (await worker.get("pageSize")) as { inner: { ratio: number } };
    deleteTrailingBlankPdfPageIfNeeded(pdf, canvas, pageSize.inner.ratio);
    pdf.save(filename);
  } finally {
    removeReportPdfFlowSpacers(element);
    element.classList.remove("report_pdf_capture");
  }
}
