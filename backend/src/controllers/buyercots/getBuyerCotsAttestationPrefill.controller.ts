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

const TRAINING_USE_NO_DEFAULT = "No - default setting only";
const TRAINING_USE_NO_CONTRACT = "No - contractually excluded";
const TRAINING_USE_YES_CONSENT = "Yes - with our consent";

function collectTrainingPolicyText(row: Record<string, unknown>): string {
  const parts: string[] = [];
  const push = (raw: unknown) => {
    const text = asText(raw);
    if (text) parts.push(text);
  };
  push(row.pain_points);
  push(row.unique_solution);
  let report = row.generated_profile_report;
  if (typeof report === "string" && report.trim()) {
    try {
      report = JSON.parse(report) as unknown;
    } catch {
      report = null;
    }
  }
  if (report && typeof report === "object") {
    const rec = report as Record<string, unknown>;
    push(rec.summary);
    const trust = rec.trustScore;
    if (trust && typeof trust === "object") push((trust as Record<string, unknown>).summary);
    const sections = rec.sections;
    if (Array.isArray(sections)) {
      for (const section of sections) {
        if (!section || typeof section !== "object") continue;
        const items = (section as Record<string, unknown>).items;
        if (!items || typeof items !== "object") continue;
        for (const value of Object.values(items as Record<string, unknown>)) {
          const text = asText(value);
          if (/train|customer data|business data/i.test(text)) push(text);
        }
      }
    }
  }
  return parts.join("\n");
}

/** Whether customer/business data trains models — not training-data documentation. */
function mapTrainingUseOfData(row: Record<string, unknown>): string {
  const text = collectTrainingPolicyText(row).toLowerCase();
  if (!text.trim()) return "";
  const notUsed =
    /no training on (customer|business) data/.test(text) ||
    /(customer|business) data (is |are )?(not|never) (used|use[sd]) (to|for) train/.test(text) ||
    /not used to train/.test(text) ||
    /do(?:es)? not (use|train).{0,60}(customer|business) data/.test(text);
  const contractuallyExcluded =
    /contractually excluded/.test(text) ||
    /contract (prohibits|forbids|excludes).{0,40}train/.test(text) ||
    /not permitted to train/.test(text);
  const usedWithConsent =
    /(train|training).{0,80}(with (our |customer )?consent|opt-?in)/.test(text) ||
    /(with (our |customer )?consent|opt-?in).{0,80}(train|training)/.test(text);
  if (contractuallyExcluded && /train/.test(text)) return TRAINING_USE_NO_CONTRACT;
  if (notUsed) return TRAINING_USE_NO_DEFAULT;
  if (usedWithConsent) return TRAINING_USE_YES_CONSENT;
  return "";
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
  const training = mapTrainingUseOfData(row);
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
        pain_points: vendorSelfAttestations.pain_points,
        unique_solution: vendorSelfAttestations.unique_solution,
        generated_profile_report: vendorSelfAttestations.generated_profile_report,
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
