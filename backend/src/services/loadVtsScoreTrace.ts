import { desc, eq } from "drizzle-orm";
import { db } from "../database/db.js";
import { generatedProfileReports } from "../schema/schema.js";
import type { ScoreTrace } from "../types/scoreTrace.js";
import { getActiveLlmModelMeta } from "../utils/activeLlmModelMeta.js";
import { buildVtsScoreTrace } from "./vtsScoreTrace.js";
import { rebuildFactorExplanationsFromStoredDetail } from "./vtsFactorExplanations.js";

export type LoadedVtsTrace = {
  trace: ScoreTrace;
  llmModelId: string | null;
  reportId: string;
  attestationId: string | null;
};

const selectFields = {
  id: generatedProfileReports.id,
  trust_score: generatedProfileReports.trust_score,
  report: generatedProfileReports.report,
  attestation_id: generatedProfileReports.attestation_id,
  product_risk: generatedProfileReports.product_risk,
  governance_risk: generatedProfileReports.governance_risk,
  operational_risk: generatedProfileReports.operational_risk,
  formula_detail: generatedProfileReports.formula_detail,
  llm_model_id: generatedProfileReports.llm_model_id,
  created_at: generatedProfileReports.created_at,
};

function resolveStoredLlmModelId(
  columnId: string | null | undefined,
  report: Record<string, unknown> | null | undefined,
): string | null {
  const fromCol = typeof columnId === "string" ? columnId.trim() : "";
  if (fromCol) return fromCol;
  if (report != null && typeof report === "object") {
    for (const key of ["llmModelId", "llm_model_id", "modelId", "model_id"] as const) {
      const v = report[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  try {
    const active = getActiveLlmModelMeta().modelId?.trim();
    if (active) return active;
  } catch {
    /* ignore */
  }
  return null;
}

/** Pillar weights the stored score was calculated with; null when not recorded. */
function readPillarWeights(
  detail: unknown,
): { product: number; governance: number; operational: number } | null {
  if (detail == null || typeof detail !== "object") return null;
  const final = (detail as Record<string, unknown>).final_formula;
  if (final == null || typeof final !== "object") return null;
  const raw = (final as Record<string, unknown>).pillar_weights;
  if (raw == null || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  const product = Number(w.product);
  const governance = Number(w.governance);
  const operational = Number(w.operational);
  if (![product, governance, operational].every(Number.isFinite)) return null;
  return { product, governance, operational };
}

type ProfileRow = {
  id: string;
  trust_score: number;
  report: unknown;
  attestation_id: string | null;
  product_risk: number | null;
  governance_risk: number | null;
  operational_risk: number | null;
  formula_detail: unknown;
  llm_model_id: string | null;
  created_at: Date | string | null;
};

async function buildLoadedTrace(row: ProfileRow): Promise<LoadedVtsTrace> {
  const report = row.report as Record<string, unknown> | null;
  const trustScoreBlock = (report?.trustScore ?? report?.trust_score) as
    | Record<string, unknown>
    | undefined;
  const rawScoreByCategory = trustScoreBlock?.scoreByCategory as
    | Record<string, unknown>
    | undefined;

  let scoreByCategory: Record<string, number> | null = rawScoreByCategory
    ? Object.fromEntries(
        Object.entries(rawScoreByCategory)
          .filter(
            ([, v]) =>
              typeof v === "number" || (typeof v === "string" && Number.isFinite(Number(v))),
          )
          .map(([k, v]) => [k, Number(v)]),
      )
    : null;

  if (!scoreByCategory || Object.keys(scoreByCategory).length === 0) {
    const pr =
      row.product_risk != null && Number.isFinite(Number(row.product_risk))
        ? Number(row.product_risk)
        : null;
    const gr =
      row.governance_risk != null && Number.isFinite(Number(row.governance_risk))
        ? Number(row.governance_risk)
        : null;
    const opr =
      row.operational_risk != null && Number.isFinite(Number(row.operational_risk))
        ? Number(row.operational_risk)
        : null;
    if (pr != null && gr != null && opr != null) {
      scoreByCategory = {
        Product: Math.max(0, Math.min(100, 100 - pr)),
        Governance: Math.max(0, Math.min(100, 100 - gr)),
        Operational: Math.max(0, Math.min(100, 100 - opr)),
      };
    }
  }

  const scoringResultDetail = (report?.scoringResult as Record<string, unknown> | undefined)?.detail;
  const pillarWeights = readPillarWeights(row.formula_detail ?? scoringResultDetail ?? null);

  const rawFactorExplanations = trustScoreBlock?.factorExplanations;
  let factorExplanations = Array.isArray(rawFactorExplanations)
    ? rawFactorExplanations
    : undefined;

  if (!factorExplanations?.length) {
    const detailSource = row.formula_detail ?? scoringResultDetail ?? null;
    const rebuilt = rebuildFactorExplanationsFromStoredDetail({
      storedTrustScore: Number(row.trust_score ?? 0),
      productRisk:
        row.product_risk != null && Number.isFinite(Number(row.product_risk))
          ? Number(row.product_risk)
          : null,
      governanceRisk:
        row.governance_risk != null && Number.isFinite(Number(row.governance_risk))
          ? Number(row.governance_risk)
          : null,
      operationalRisk:
        row.operational_risk != null && Number.isFinite(Number(row.operational_risk))
          ? Number(row.operational_risk)
          : null,
      formulaDetail: detailSource,
    });
    if (rebuilt.length > 0) {
      factorExplanations = rebuilt;
      try {
        const trustKey = report && "trustScore" in report ? "trustScore" : "trust_score";
        const prevTrust =
          trustScoreBlock && typeof trustScoreBlock === "object" ? trustScoreBlock : {};
        const updatedReport = {
          ...(report && typeof report === "object" ? report : {}),
          [trustKey]: {
            ...prevTrust,
            factorExplanations: rebuilt,
          },
        };
        await db
          .update(generatedProfileReports)
          .set({ report: updatedReport })
          .where(eq(generatedProfileReports.id, row.id));
      } catch (persistErr) {
        console.warn(
          "loadVtsScoreTrace: failed to persist rebuilt factorExplanations:",
          persistErr instanceof Error ? persistErr.message : persistErr,
        );
      }
    }
  }

  const trace = buildVtsScoreTrace({
    storedTrustScore: Number(row.trust_score ?? 0),
    scoreByCategory: Object.keys(scoreByCategory ?? {}).length > 0 ? scoreByCategory : null,
    reportId: row.id,
    attestationId: row.attestation_id ?? null,
    factorExplanations,
    generatedAt: row.created_at,
    pillarWeights,
  });

  return {
    trace,
    llmModelId: resolveStoredLlmModelId(
      row.llm_model_id,
      report && typeof report === "object" ? report : null,
    ),
    reportId: row.id,
    attestationId: row.attestation_id ?? null,
  };
}

/** Internal VTS lookup: generated_profile_reports.id first, then attestation_id. */
export async function loadVtsScoreTraceByReportOrAttestationId(
  id: string,
): Promise<LoadedVtsTrace | null> {
  let [row] = await db
    .select(selectFields)
    .from(generatedProfileReports)
    .where(eq(generatedProfileReports.id, id))
    .limit(1);

  if (!row) {
    [row] = await db
      .select(selectFields)
      .from(generatedProfileReports)
      .where(eq(generatedProfileReports.attestation_id, id))
      .orderBy(desc(generatedProfileReports.created_at))
      .limit(1);
  }

  if (!row) return null;
  return buildLoadedTrace(row);
}

/** Vendor VTS lookup: latest stored profile for this attestation only. */
export async function loadVtsScoreTraceByAttestationId(
  attestationId: string,
): Promise<LoadedVtsTrace | null> {
  const [row] = await db
    .select(selectFields)
    .from(generatedProfileReports)
    .where(eq(generatedProfileReports.attestation_id, attestationId))
    .orderBy(desc(generatedProfileReports.created_at))
    .limit(1);
  if (!row) return null;
  return buildLoadedTrace(row);
}
