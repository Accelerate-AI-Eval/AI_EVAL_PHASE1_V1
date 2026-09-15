/** Map vendor attestation answers onto buyer COTS read-only fields. */

import { applyBuyerCotsDerivedFields } from "./buyerCotsDerived";

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] != null && String(obj[key]).trim() !== "") return obj[key];
  }
  return undefined;
}

function asText(raw: unknown): string {
  if (raw == null) return "";
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return asText(o.value ?? o.label ?? o.name ?? "");
  }
  return String(raw).trim();
}

function matchAlias(raw: string, aliases: Record<string, string>): string {
  const key = raw.trim().toLowerCase();
  if (!key) return "";
  if (aliases[key]) return aliases[key];
  const hits = Object.entries(aliases)
    .filter(([alias]) => alias.length >= 4 && (key.includes(alias) || alias.includes(key)))
    .sort((a, b) => b[0].length - a[0].length);
  return hits[0]?.[1] ?? raw.trim();
}

const MONITORING_ALIASES: Record<string, string> = {
  "yes, comprehensive analytics": "Yes - Comprehensive analytics and dashboards",
  "yes - comprehensive analytics and dashboards": "Yes - Comprehensive analytics and dashboards",
  comprehensive: "Yes - Comprehensive analytics and dashboards",
  real_time_alerting: "Yes - Comprehensive analytics and dashboards",
  daily_dashboard: "Yes - Comprehensive analytics and dashboards",
  "yes, basic metrics": "Yes - Basic usage metrics available",
  "yes - basic usage metrics available": "Yes - Basic usage metrics available",
  "basic metrics": "Yes - Basic usage metrics available",
  weekly_reports: "Yes - Basic usage metrics available",
  monthly_reviews: "Yes - Basic usage metrics available",
  "limited/partial": "Limited - Some data available upon request",
  limited: "Limited - Some data available upon request",
  "limited - some data available upon request": "Limited - Some data available upon request",
  no: "No - No interaction data provided",
  none: "No - No interaction data provided",
  "no - no interaction data provided": "No - No interaction data provided",
};

const AUDIT_ALIASES: Record<string, string> = {
  "yes, comprehensive": "Yes - Comprehensive audit logs with retention",
  "yes - comprehensive audit logs with retention": "Yes - Comprehensive audit logs with retention",
  comprehensive: "Yes - Comprehensive audit logs with retention",
  "yes, basic logging": "Yes - Basic logging available",
  "yes - basic logging available": "Yes - Basic logging available",
  "basic logging": "Yes - Basic logging available",
  "limited/partial": "Limited - Partial logging only",
  limited: "Limited - Partial logging only",
  "limited - partial logging only": "Limited - Partial logging only",
  no: "No - No audit logs available",
  none: "No - No audit logs available",
  "no - no audit logs available": "No - No audit logs available",
};

function asToken(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "object") {
    const o = item as Record<string, unknown>;
    return String(o.value ?? o.label ?? o.code ?? o.name ?? "").trim();
  }
  return String(item).trim();
}

function asList(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map(asToken).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(asToken).filter(Boolean);
  } catch {
    /* comma-separated */
  }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

const EXPORT_YES = "Yes - full export in standard formats";
const EXPORT_NO = "No - data cannot be exported";
const EXPORT_UNKNOWN = "Not yet established";

function mapDataExport(rightsRaw: unknown): string {
  if (rightsRaw == null || rightsRaw === "") return "";
  const tokens = asList(rightsRaw).map((t) => t.toLowerCase());
  if (tokens.some((t) => t.includes("portability"))) return EXPORT_YES;
  if (tokens.length === 0) return EXPORT_UNKNOWN;
  return EXPORT_NO;
}

export const BUYER_COTS_ATTESTATION_PREFILL_KEYS = [
  "trainingUseOfData",
  "monitoringDataAvailable",
  "auditLogsAvailable",
  "dataExportCapability",
] as const;

export function isBuyerCotsAttestationLockedField(
  _formData: Record<string, string>,
  key: string,
): boolean {
  return (BUYER_COTS_ATTESTATION_PREFILL_KEYS as readonly string[]).includes(key);
}

export function mapAttestationToBuyerCotsPrefill(
  attestation: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!attestation) return {};
  const monitoringRaw = pick(
    attestation,
    "interaction_data_available",
    "available_usage_data",
    "production_model_monitoring",
  );
  const monitoring = matchAlias(asText(monitoringRaw), MONITORING_ALIASES);
  const audit = matchAlias(asText(pick(attestation, "audit_logs_available", "audit_logs")), AUDIT_ALIASES);
  const training = asText(pick(attestation, "training_data_documentation", "training_data_document"));
  const dataExport = mapDataExport(pick(attestation, "data_subject_rights"));

  const out: Record<string, string> = {};
  if (training) out.trainingUseOfData = training;
  if (monitoringRaw != null && asText(monitoringRaw)) {
    out.monitoringDataAvailable = monitoring || asText(monitoringRaw);
  }
  const auditRaw = pick(attestation, "audit_logs_available", "audit_logs");
  if (audit || asText(auditRaw)) out.auditLogsAvailable = audit || asText(auditRaw);
  if (dataExport) out.dataExportCapability = dataExport;
  out.trainingUseOfDataStance = "";
  out.trainingUseOfDataDisputeNote = "";
  out.monitoringDataStance = "";
  out.monitoringDataDisputeNote = "";
  out.auditLogsStance = "";
  out.auditLogsDisputeNote = "";
  out.dataExportStance = "";
  out.dataExportDisputeNote = "";
  return out;
}

export function mergeAttestationPrefill(
  prev: Record<string, string>,
  mapped: Record<string, string>,
  overwrite = false,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const key of BUYER_COTS_ATTESTATION_PREFILL_KEYS) {
    if (!mapped[key]) continue;
    patch[`${key}Attested`] = mapped[key];
    if (overwrite || !String(prev[key] ?? "").trim() || String(prev[`${key}Attested`] ?? "").trim()) {
      patch[key] = mapped[key];
    }
  }
  if (overwrite) {
    patch.trainingUseOfDataStance = "";
    patch.trainingUseOfDataDisputeNote = "";
    patch.monitoringDataStance = "";
    patch.monitoringDataDisputeNote = "";
    patch.auditLogsStance = "";
    patch.auditLogsDisputeNote = "";
    patch.dataExportStance = "";
    patch.dataExportDisputeNote = "";
  }
  return applyBuyerCotsDerivedFields(prev, patch);
}

export function clearBuyerCotsAttestationPrefill(): Record<string, string> {
  return {
    trainingUseOfData: "",
    monitoringDataAvailable: "",
    auditLogsAvailable: "",
    dataExportCapability: "",
    trainingUseOfDataStance: "",
    trainingUseOfDataDisputeNote: "",
    monitoringDataStance: "",
    monitoringDataDisputeNote: "",
    auditLogsStance: "",
    auditLogsDisputeNote: "",
    dataExportStance: "",
    dataExportDisputeNote: "",
    trainingUseOfDataAttested: "",
    monitoringDataAvailableAttested: "",
    auditLogsAvailableAttested: "",
    dataExportCapabilityAttested: "",
  };
}
