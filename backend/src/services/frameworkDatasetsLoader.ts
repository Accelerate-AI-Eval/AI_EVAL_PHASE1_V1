/**
 * Loads CISO framework control catalogs from backend data dirs.
 * Shared by compliance PDF mapping and framework-mapping row enrichment.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

export type FrameworkControl = {
  controlId: string;
  title: string;
  description?: string;
  implementationGuidance?: string;
  aiRiskDomains?: string[];
};

export type FrameworkDataset = {
  framework: { name?: string; version?: string };
  controls: FrameworkControl[];
};

function resolveBackendDataDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "src", "data"),
    path.resolve(process.cwd(), "dist", "data"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
    } catch {
      /* ignore */
    }
  }
  return path.resolve(process.cwd(), "src", "data");
}

const DATA_DIR = resolveBackendDataDir();
const CISO_FRAMEWORKS_DIR = path.join(DATA_DIR, "ciso-frameworks");

let frameworkCache: FrameworkDataset[] | null = null;

function parseFrameworkDatasetFile(filePath: string): FrameworkDataset | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (!Array.isArray(o.controls) || o.controls.length === 0) return null;
    if (!o.framework || typeof o.framework !== "object") return null;
    return raw as FrameworkDataset;
  } catch {
    return null;
  }
}

/**
 * Load every framework library under `src/data/ciso-frameworks` plus top-level `src/data/*.json`
 * control catalogs. Dedupes by framework name + version.
 */
export function loadFrameworkDatasets(): FrameworkDataset[] {
  if (frameworkCache) return frameworkCache;
  const datasets: FrameworkDataset[] = [];
  const seen = new Set<string>();

  const addFile = (filePath: string) => {
    const ds = parseFrameworkDatasetFile(filePath);
    if (!ds) return;
    const name = String(ds.framework?.name ?? "unknown").trim().toLowerCase();
    const ver = String(ds.framework?.version ?? "").trim().toLowerCase();
    const key = `${name}::${ver}`;
    if (seen.has(key)) return;
    seen.add(key);
    datasets.push(ds);
  };

  try {
    if (fs.existsSync(CISO_FRAMEWORKS_DIR) && fs.statSync(CISO_FRAMEWORKS_DIR).isDirectory()) {
      for (const name of fs.readdirSync(CISO_FRAMEWORKS_DIR)) {
        if (!name.toLowerCase().endsWith(".json")) continue;
        addFile(path.join(CISO_FRAMEWORKS_DIR, name));
      }
    }
  } catch {
    /* ciso-frameworks dir missing */
  }

  try {
    for (const name of fs.readdirSync(DATA_DIR)) {
      if (!name.toLowerCase().endsWith(".json")) continue;
      const full = path.join(DATA_DIR, name);
      if (!fs.statSync(full).isFile()) continue;
      addFile(full);
    }
  } catch {
    /* data dir missing */
  }

  frameworkCache = datasets;
  return datasets;
}

function stripVersionParenthetical(s: string): string {
  return s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function datasetMatchesRowLabel(ds: FrameworkDataset, hint: string): boolean {
  const name = String(ds.framework?.name ?? "").trim().toLowerCase();
  if (!name || !hint) return false;
  if (hint.includes(name) || name.includes(hint)) return true;
  const hintFirst = hint.split(/[\s/]+/).find((p) => p.length >= 3) ?? "";
  return hintFirst.length >= 3 && name.includes(hintFirst);
}

function descriptionFromCatalogControl(c: FrameworkControl): string {
  const d = String(c.description ?? "").trim();
  if (d) return d;
  return String(c.implementationGuidance ?? "").trim();
}

const MAX_LOOKUP_DESCRIPTION_LEN = 4000;

/**
 * Resolve catalog text for a control ID using the framework name on the mapping row
 * (e.g. "GDPR (2016/679)" or "NIST AI RMF") and optional global fallback when the ID is unique.
 */
export function lookupControlDescription(
  rowFrameworkLabel: string,
  controlId: string,
): string {
  const id = String(controlId ?? "").trim();
  if (!id) return "";
  const hint = stripVersionParenthetical(String(rowFrameworkLabel ?? "").toLowerCase());
  const datasets = loadFrameworkDatasets();
  const idLower = id.toLowerCase();

  const tryFind = (ds: FrameworkDataset): string => {
    for (const c of ds.controls) {
      if (String(c.controlId ?? "").trim().toLowerCase() === idLower) {
        const text = descriptionFromCatalogControl(c);
        if (text.length > MAX_LOOKUP_DESCRIPTION_LEN) {
          return `${text.slice(0, MAX_LOOKUP_DESCRIPTION_LEN)}…`;
        }
        return text;
      }
    }
    return "";
  };

  for (const ds of datasets) {
    if (!datasetMatchesRowLabel(ds, hint)) continue;
    const found = tryFind(ds);
    if (found) return found;
  }

  for (const ds of datasets) {
    const found = tryFind(ds);
    if (found) return found;
  }

  return "";
}
