/**
 * Extract text from compliance PDFs (pdf-parse-new) and infer certificate/report expiry dates.
 * Used after vendor attestation submit (COMPLETED) for slot-2 categorized compliance documents.
 */
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse-new") as (
  dataBuffer: Buffer,
  options?: { verbosityLevel?: number },
) => Promise<{ text?: string }>;
import { db } from "../database/db.js";
import { vendorSelfAttestations } from "../schema/schema.js";
import { eq } from "drizzle-orm";
import { buildFrameworkMappingRowsFromComplianceExpiries } from "./frameworkMappingFromCompliance.js";
import { loadFrameworkDatasets, type FrameworkControl } from "./frameworkDatasetsLoader.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads_vendor_attestations");

export type ComplianceDocExpiryEntry = {
  category: string;
  expiryAt: string | null;
  parsedAt: string;
  documentClass?: string;
  frameworkMapping?: {
    framework: string;
    version?: string;
    controls: Array<{
      controlId: string;
      title: string;
      /** Full catalog description for this control (from framework JSON). */
      description: string;
      relevanceScore: number;
    }>;
  };
  validation?: {
    isValid: boolean;
    reason: string;
    controlsMapped: number;
  };
  error?: string;
};

export type ComplianceDocExpiryMap = Record<string, ComplianceDocExpiryEntry>;

const MONTHS =
  "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";

/** Lines that suggest an expiry / validity end date (compliance certs, SOC reports). */
const EXPIRY_LINE =
  /valid\s*(?:until|through|to|from)|expir(?:es|y|ation)|certificate\s*(?:is\s*)?valid|period\s*(?:of\s*)?(?:validity|coverage)|report\s*period|audit\s*period|coverage\s*period|effective\s*(?:until|through)|remains\s*valid|due\s*for\s*renewal/i;

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenizeText(s: string): Set<string> {
  return new Set(
    normalizeToken(s)
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function classifyDocument(category: string, fileName: string, text: string): string {
  const hay = `${category} ${fileName} ${text.slice(0, 5000)}`.toLowerCase();
  if (/soc\s*2|soc2/.test(hay)) return "SOC2";
  if (/iso\s*27001|iso-?27001/.test(hay)) return "ISO27001";
  if (/nist|800-53|800-171|csf/.test(hay)) return "NIST";
  if (/hipaa|phi|e-?phi|\bbaa\b|hitrust/.test(hay)) return "HIPAA";
  if (/gdpr|privacy/.test(hay)) return "GDPR";
  if (/pci|dss/.test(hay)) return "PCI-DSS";
  if (/dora/.test(hay)) return "DORA";
  if (/cmmc/.test(hay)) return "CMMC";
  if (/certificat|attestation|audit|compliance/.test(hay)) return "COMPLIANCE_EVIDENCE";
  return "GENERAL_COMPLIANCE_DOCUMENT";
}

function frameworkFitsClass(name: string, docClass: string): boolean {
  const n = name.toLowerCase();
  if (docClass === "SOC2") return n.includes("soc2");
  if (docClass === "ISO27001") return n.includes("iso");
  if (docClass === "NIST") return n.includes("nist");
  if (docClass === "HIPAA") return n.includes("hipaa");
  if (docClass === "GDPR") return n.includes("gdpr");
  if (docClass === "PCI-DSS") return n.includes("pci");
  if (docClass === "DORA") return n.includes("dora");
  if (docClass === "CMMC") return n.includes("cmmc");
  return true;
}

const MAX_STORED_CONTROL_DESCRIPTION_LEN = 4000;

function mapToFrameworkControls(
  text: string,
  docClass: string,
): {
  framework: string;
  version?: string;
  controls: Array<{
    controlId: string;
    title: string;
    description: string;
    relevanceScore: number;
  }>;
} | null {
  const frameworks = loadFrameworkDatasets();
  if (frameworks.length === 0) return null;
  const textTokens = tokenizeText(text.slice(0, 20000));
  let best:
    | {
        framework: string;
        version?: string;
        controls: Array<{
          controlId: string;
          title: string;
          description: string;
          relevanceScore: number;
        }>;
      }
    | null = null;
  for (const ds of frameworks) {
    const fName = String(ds.framework?.name ?? "").trim() || "Unknown Framework";
    if (!frameworkFitsClass(fName, docClass)) continue;
    const scored = ds.controls
      .map((c: FrameworkControl) => {
        const tokens = tokenizeText(
          `${c.title ?? ""} ${c.description ?? ""} ${c.implementationGuidance ?? ""}`,
        );
        let overlap = 0;
        for (const t of tokens) if (textTokens.has(t)) overlap++;
        const descRaw = String(c.description ?? c.implementationGuidance ?? "").trim();
        const description =
          descRaw.length > MAX_STORED_CONTROL_DESCRIPTION_LEN
            ? `${descRaw.slice(0, MAX_STORED_CONTROL_DESCRIPTION_LEN)}…`
            : descRaw;
        return {
          controlId: String(c.controlId ?? "").trim(),
          title: String(c.title ?? "").trim(),
          description,
          relevanceScore: overlap,
        };
      })
      .filter((c) => c.controlId && c.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 6);
    if (scored.length === 0) continue;
    const total = scored.reduce((sum, c) => sum + c.relevanceScore, 0);
    const bestTotal = best ? best.controls.reduce((sum, c) => sum + c.relevanceScore, 0) : -1;
    if (total > bestTotal) {
      best = {
        framework: fName,
        version: ds.framework?.version,
        controls: scored,
      };
    }
  }
  return best;
}

function padY(y: number): number {
  if (y >= 0 && y < 100) return y >= 50 ? 1900 + y : 2000 + y;
  return y;
}

function parseDateCandidate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY or MM/DD/YYYY (prefer day-first for EU certs; if first part > 12 it's DMY)
  m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y = padY(y);
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      day = b;
      month = a;
    } else {
      // ambiguous: assume MM/DD (US) for SOC-style reports
      month = a;
      day = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(y, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Month DD, YYYY
  const re = new RegExp(
    `\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})\\b`,
    "i",
  );
  m = s.match(re);
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD Month YYYY
  const re2 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\s+(\\d{4})\\b`, "i");
  m = s.match(re2);
  if (m) {
    const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function extractDatesFromChunk(chunk: string): Date[] {
  const out: Date[] = [];
  const isoAll = chunk.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g);
  for (const x of isoAll) {
    const d = parseDateCandidate(x[1] ?? "");
    if (d) out.push(d);
  }
  const slashAll = chunk.matchAll(/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g);
  for (const x of slashAll) {
    const d = parseDateCandidate(x[0] ?? "");
    if (d) out.push(d);
  }
  const monthAll = chunk.matchAll(
    new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s*\\d{4}\\b`, "gi"),
  );
  for (const x of monthAll) {
    const d = parseDateCandidate(x[0] ?? "");
    if (d) out.push(d);
  }
  const dmyAll = chunk.matchAll(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\s+\\d{4}\\b`, "gi"));
  for (const x of dmyAll) {
    const d = parseDateCandidate(x[0] ?? "");
    if (d) out.push(d);
  }
  return out;
}

function isReasonableCertDate(d: Date): boolean {
  const y = d.getFullYear();
  return y >= 2020 && y <= 2048;
}

/** YYYY-MM-DD in local calendar (avoids UTC off-by-one for cert wording dates). */
function toDateOnlyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Pick best expiry from certificate-style text: prefer dates on/near expiry keywords, else latest reasonable date in those lines.
 */
export function extractExpiryFromText(fullText: string): Date | null {
  const text = fullText.replace(/\r\n/g, "\n").slice(0, 600_000);
  const lines = text.split("\n");
  const keywordDates: Date[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!EXPIRY_LINE.test(line)) continue;
    const window = [line, lines[i + 1] ?? "", lines[i - 1] ?? ""].join(" ");
    const dates = extractDatesFromChunk(window).filter(isReasonableCertDate);
    for (const d of dates) keywordDates.push(d);
  }
  if (keywordDates.length > 0) {
    keywordDates.sort((a, b) => b.getTime() - a.getTime());
    return keywordDates[0] ?? null;
  }
  // Fallback: last ISO or slash date in first 80 lines (cover page often has period)
  const head = lines.slice(0, 80).join("\n");
  const headDates = extractDatesFromChunk(head).filter(isReasonableCertDate);
  if (headDates.length > 0) {
    headDates.sort((a, b) => b.getTime() - a.getTime());
    return headDates[0] ?? null;
  }
  return null;
}

async function extractTextFromFile(filePath: string, ext: string): Promise<string> {
  const buf = await fs.promises.readFile(filePath);
  const e = ext.toLowerCase();
  if (e === ".pdf") {
    const data = await pdfParse(buf, { verbosityLevel: 0 });
    return (data.text ?? "").trim();
  }
  if (e === ".docx" || e === ".doc") {
    throw new Error("Only PDF is parsed for expiry; export or upload as PDF.");
  }
  if (e === ".ppt" || e === ".pptx") {
    throw new Error("Slides are not parsed for expiry; export or upload as PDF.");
  }
  throw new Error(`Unsupported extension: ${ext}`);
}

function collectComplianceFiles(
  documentUploads: Record<string, unknown> | null | undefined,
): Array<{ fileName: string; category: string }> {
  const out: Array<{ fileName: string; category: string }> = [];
  const seen = new Set<string>();
  if (!documentUploads || typeof documentUploads !== "object") return out;
  const addFile = (rawName: string, category: string) => {
    const base = path.basename(rawName.trim());
    if (!base || base === "." || base === "..") return;
    if (path.extname(base).toLowerCase() !== ".pdf") return;
    if (seen.has(base)) return;
    seen.add(base);
    out.push({ fileName: base, category });
  };
  const addFiles = (files: unknown, category: string) => {
    if (!Array.isArray(files)) return;
    for (const f of files) {
      if (typeof f !== "string" || !f.trim()) continue;
      addFile(f, category);
    }
  };

  addFiles(documentUploads["0"], "marketing_material");
  addFiles(documentUploads["1"], "technical_material");
  addFiles(documentUploads["evidenceTestingPolicy"], "evidence_testing_policy");

  const slot2 = documentUploads["2"];
  if (slot2 != null && typeof slot2 === "object" && !Array.isArray(slot2)) {
    const byCat = (slot2 as Record<string, unknown>).byCategory;
    if (byCat && typeof byCat === "object") {
      for (const [category, files] of Object.entries(byCat)) {
        addFiles(files, category);
      }
    }
  }
  return out;
}

/**
 * Parse compliance uploads on disk and persist expiry metadata for the attestation.
 */
export async function parseAndStoreComplianceDocumentExpiries(
  attestationId: string,
  documentUploads: Record<string, unknown> | null | undefined,
): Promise<ComplianceDocExpiryMap> {
  const items = collectComplianceFiles(documentUploads);
  const result: ComplianceDocExpiryMap = {};
  const dir = path.resolve(UPLOADS_DIR, attestationId);
  const baseResolved = path.resolve(UPLOADS_DIR);
  if (!dir.startsWith(baseResolved)) {
    return result;
  }

  const nowIso = new Date().toISOString();

  for (const { fileName, category } of items) {
    const safe = path.basename(fileName);
    const filePath = path.resolve(dir, safe);
    if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
      result[safe] = {
        category,
        expiryAt: null,
        parsedAt: nowIso,
        error: "File not found on server",
      };
      continue;
    }
    const ext = path.extname(safe);
    try {
      const text = await extractTextFromFile(filePath, ext);
      if (!text || text.length < 20) {
        result[safe] = {
          category,
          expiryAt: null,
          parsedAt: nowIso,
          error: "Could not extract enough text from document",
        };
        continue;
      }
      const expiry = extractExpiryFromText(text);
      const documentClass = classifyDocument(category, safe, text);
      const frameworkMapping = mapToFrameworkControls(text, documentClass);
      const validation =
        frameworkMapping != null
          ? {
              isValid: frameworkMapping.controls.length > 0,
              reason:
                frameworkMapping.controls.length > 0
                  ? "" // "Document classified and mapped to framework controls"
                  : "Framework detected but no controls matched document content",
              controlsMapped: frameworkMapping.controls.length,
            }
          : {
              isValid: false,
              reason: "No framework mapping found from backend data folder",
              controlsMapped: 0,
            };
      result[safe] = {
        category,
        expiryAt: expiry ? toDateOnlyLocal(expiry) : null,
        parsedAt: nowIso,
        documentClass,
        frameworkMapping: frameworkMapping ?? undefined,
        validation,
        ...(expiry ? {} : { error: "No expiry date pattern detected" }),
      };
    } catch (err) {
      result[safe] = {
        category,
        expiryAt: null,
        parsedAt: nowIso,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const frameworkMappingRows = buildFrameworkMappingRowsFromComplianceExpiries(result);

  try {
    await db
      .update(vendorSelfAttestations)
      .set({
        compliance_document_expiries: result as unknown as Record<string, unknown>,
        framework_mapping_rows: frameworkMappingRows,
        updated_at: new Date(),
      })
      .where(eq(vendorSelfAttestations.id, attestationId));
  } catch (e) {
    console.error("parseAndStoreComplianceDocumentExpiries DB update:", e);
  }

  return result;
}
