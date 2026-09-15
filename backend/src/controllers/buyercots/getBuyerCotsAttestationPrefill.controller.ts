import type { Request, Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../database/db.js";
import { vendorSelfAttestations } from "../../schema/schema.js";

function asText(raw: unknown): string {
  if (raw == null) return "";
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return asText(o.value ?? o.label ?? o.name ?? "");
  }
  return String(raw).trim();
}

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

function mapDataExport(rightsRaw: unknown): string {
  if (rightsRaw == null || rightsRaw === "") return "";
  const tokens = asList(rightsRaw).map((t) => t.toLowerCase());
  if (tokens.some((t) => t.includes("portability"))) return "Yes - full export in standard formats";
  if (tokens.length === 0) return "Not yet established";
  return "No - data cannot be exported";
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
  no: "No - No interaction data provided",
  none: "No - No interaction data provided",
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
  no: "No - No audit logs available",
  none: "No - No audit logs available",
};

function mapAttestationRow(row: Record<string, unknown>): Record<string, string> {
  const monitoring = matchAlias(
    asText(row.available_usage_data) || asText(row.production_model_monitoring),
    MONITORING_ALIASES,
  );
  const audit = matchAlias(asText(row.audit_logs), AUDIT_ALIASES);
  const training = asText(row.training_data_document);
  const dataExport = mapDataExport(row.data_subject_rights);

  const out: Record<string, string> = {};
  if (training) out.trainingUseOfData = training;
  if (monitoring) out.monitoringDataAvailable = monitoring;
  if (audit) out.auditLogsAvailable = audit;
  if (dataExport) out.dataExportCapability = dataExport;
  return out;
}

/** GET /buyerCotsAssessment/attestation-prefill/:attestationId */
const getBuyerCotsAttestationPrefill = async (req: Request, res: Response) => {
  try {
    const attestationId = String((req.params as { attestationId?: string }).attestationId ?? "").trim();
    if (!attestationId) {
      return res.status(400).json({ success: false, message: "Attestation ID required" });
    }

    const [row] = await db
      .select({
        available_usage_data: vendorSelfAttestations.available_usage_data,
        production_model_monitoring: vendorSelfAttestations.production_model_monitoring,
        audit_logs: vendorSelfAttestations.audit_logs,
        training_data_document: vendorSelfAttestations.training_data_document,
        data_subject_rights: vendorSelfAttestations.data_subject_rights,
      })
      .from(vendorSelfAttestations)
      .where(
        and(
          eq(vendorSelfAttestations.id, attestationId),
          sql`upper(${vendorSelfAttestations.status}) = 'COMPLETED'`,
          eq(vendorSelfAttestations.visible_to_buyer, true),
          sql`(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`,
          isNull(vendorSelfAttestations.user_archived_at),
        ),
      )
      .limit(1);

    if (!row) {
      return res.status(404).json({ success: false, message: "Attestation not found" });
    }

    return res.status(200).json({
      success: true,
      prefill: mapAttestationRow(row as Record<string, unknown>),
    });
  } catch (error) {
    console.error("getBuyerCotsAttestationPrefill:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export default getBuyerCotsAttestationPrefill;
