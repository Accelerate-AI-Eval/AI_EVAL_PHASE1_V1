/**
 * IRS Score Trace — internal operator explainability only.
 *
 * Mirrors the logic of calculateOrgReadinessGap() and calculateIntegrationRisk()
 * in buyerImplementationRiskScore.ts WITHOUT modifying those functions.
 *
 * Each factor adjustment is emitted as a ScoreTraceComponent whose `contribution`
 * is the effect on the FINAL IRS score (not the sub-risk intermediate).
 *
 * Conversion: a +D increase in OrgReadinessGap sub-risk → -(D × 0.35) on IRS.
 *             a +D increase in IntegrationRisk sub-risk → -(D × 0.30) on IRS.
 *
 * INTERNAL USE ONLY — never return this data to buyer or vendor users.
 */

import { SCORING_VERSION } from "../lib/scoringVersion.js";
import type { ScoreTrace, ScoreTraceComponent } from "../types/scoreTrace.js";
import { irsFinalScoreFromParts, resolveBuyerIrsInputs } from "./buyerImplementationRiskScore.js";

// ── Weight constants (mirrors buyerImplementationRiskScore.ts, not re-exported) ──
const W_VENDOR = 0.35;
const W_ORG    = 0.35;
const W_INT    = 0.30;

// ── Helpers (exact copies of private helpers in buyerImplementationRiskScore.ts) ──

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function boolYes(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = norm(v);
  return s.startsWith("yes") || s === "true" || s === "available" || s === "exists" || s === "defined";
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // no-op
    }
    return t.split(/,|;|\r?\n/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return String(v).trim() === "";
}

function isHighStakes(criticality: string): boolean {
  return (
    criticality.includes("life or death") ||
    criticality.includes("major financial") ||
    criticality.includes("high") ||
    criticality.includes("critical") ||
    criticality.includes("work stops") ||
    criticality.includes("mission")
  );
}

function isLowOrMediumStakes(criticality: string): boolean {
  return (
    criticality.includes("low impact") ||
    criticality.includes("minimal") ||
    criticality.includes("moderate impact") ||
    criticality.includes("medium") ||
    criticality.includes("low") ||
    criticality.includes("work continues") ||
    criticality.includes("additive") ||
    criticality.includes("work degrades")
  );
}

function isAggressiveAppetite(appetite: string): boolean {
  return (
    appetite.includes("aggressive") ||
    appetite.includes("very high") ||
    appetite.startsWith("high")
  );
}

function isConservativeAppetite(appetite: string): boolean {
  return (
    appetite.includes("conservative") ||
    appetite.includes("very low") ||
    appetite.startsWith("low")
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toIsoTimestamp(value: string | Date | null | undefined): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function component(
  label: string,
  category: string,
  contributionRaw: number,
  reason: string,
  sourceType: ScoreTraceComponent["sourceType"],
  sourceLabel: string,
): ScoreTraceComponent {
  const contribution = round2(contributionRaw);
  return {
    label,
    category,
    contribution,
    direction: contribution > 0 ? "positive" : contribution < 0 ? "negative" : "neutral",
    reason,
    sourceType,
    sourceLabel,
    internalOnly: true,
  };
}

// ── Org Readiness Gap trace ────────────────────────────────────────────────────

function traceOrgReadinessGap(
  buyerPayload: Record<string, unknown>,
): { components: ScoreTraceComponent[]; computedRisk: number; warnings: string[] } {
  const components: ScoreTraceComponent[] = [];
  const warnings: string[] = [];
  let risk = 35;

  // Base
  components.push(
    component(
      "Organizational Readiness — base risk",
      "OrgReadiness",
      -(35 * W_ORG),
      "All buyer assessments start with a base organizational readiness gap of 35.",
      "system_default",
      "scoring engine default",
    ),
  );

  // Digital maturity (Level 1–5 buyer COTS options + legacy labels)
  const digital = norm(buyerPayload.digitalMaturityLevel);
  if (
    digital.includes("level 5") ||
    digital.includes("level 4") ||
    digital.includes("high") ||
    digital.includes("advanced")
  ) {
    risk -= 10;
    components.push(
      component(
        "Digital Maturity: High/Advanced (Level 4–5)",
        "OrgReadiness",
        +(10 * W_ORG),
        `Digital maturity reported as "${buyerPayload.digitalMaturityLevel}" — reduces organizational gap risk by 10.`,
        "assessment_answer",
        "field: digitalMaturityLevel",
      ),
    );
  } else if (digital.includes("level 3") || digital.includes("medium")) {
    risk -= 4;
    components.push(
      component(
        "Digital Maturity: Medium (Level 3)",
        "OrgReadiness",
        +(4 * W_ORG),
        `Digital maturity reported as "${buyerPayload.digitalMaturityLevel}" — reduces organizational gap risk by 4.`,
        "assessment_answer",
        "field: digitalMaturityLevel",
      ),
    );
  } else if (
    digital.includes("level 1") ||
    digital.includes("level 2") ||
    digital.includes("low") ||
    digital.includes("ad-hoc")
  ) {
    risk += 10;
    components.push(
      component(
        "Digital Maturity: Low (Level 1–2)",
        "OrgReadiness",
        -(10 * W_ORG),
        `Digital maturity reported as "${buyerPayload.digitalMaturityLevel}" — increases organizational gap risk by 10.`,
        "assessment_answer",
        "field: digitalMaturityLevel",
      ),
    );
  }

  // Data governance
  const governance = norm(buyerPayload.dataGovernanceMaturity);
  if (
    governance.includes("optimized") ||
    governance.includes("managed") ||
    governance.includes("mature") ||
    governance.includes("excellent")
  ) {
    risk -= 8;
    components.push(
      component(
        "Data Governance: Optimized/Managed/Mature",
        "OrgReadiness",
        +(8 * W_ORG),
        `Data governance reported as "${buyerPayload.dataGovernanceMaturity}" — reduces organizational gap risk by 8.`,
        "assessment_answer",
        "field: dataGovernanceMaturity",
      ),
    );
  } else if (
    governance.includes("basic") ||
    governance.includes("developing") ||
    governance.includes("defined")
  ) {
    risk += 4;
    components.push(
      component(
        "Data Governance: Basic/Developing",
        "OrgReadiness",
        -(4 * W_ORG),
        `Data governance reported as "${buyerPayload.dataGovernanceMaturity}" — increases organizational gap risk by 4.`,
        "assessment_answer",
        "field: dataGovernanceMaturity",
      ),
    );
  } else if (
    governance.includes("ad-hoc") ||
    governance.includes("low") ||
    governance.includes("initial") ||
    governance.startsWith("none")
  ) {
    risk += 10;
    components.push(
      component(
        "Data Governance: None/Initial/Ad-hoc",
        "OrgReadiness",
        -(10 * W_ORG),
        `Data governance reported as "${buyerPayload.dataGovernanceMaturity}" — increases organizational gap risk by 10.`,
        "assessment_answer",
        "field: dataGovernanceMaturity",
      ),
    );
  }

  // AI governance board — only when an answer or onboarding proxy exists
  if (!isEmpty(buyerPayload.aiGovernanceBoard) && !boolYes(buyerPayload.aiGovernanceBoard)) {
    risk += 8;
    components.push(
      component(
        "No AI Governance Board",
        "OrgReadiness",
        -(8 * W_ORG),
        `AI governance board field value "${buyerPayload.aiGovernanceBoard}" was not recognized as confirmed — increases gap risk by 8.`,
        "assessment_answer",
        "field: aiGovernanceBoard",
      ),
    );
  } else if (boolYes(buyerPayload.aiGovernanceBoard)) {
    components.push(
      component(
        "AI Governance Board Confirmed",
        "OrgReadiness",
        0,
        `AI governance board confirmed — no penalty applied.`,
        "assessment_answer",
        "field: aiGovernanceBoard",
      ),
    );
  }

  // AI ethics policy
  if (!isEmpty(buyerPayload.aiEthicsPolicy) && !boolYes(buyerPayload.aiEthicsPolicy)) {
    risk += 8;
    components.push(
      component(
        "No AI Ethics Policy",
        "OrgReadiness",
        -(8 * W_ORG),
        `AI ethics policy field value "${buyerPayload.aiEthicsPolicy}" was not recognized as confirmed — increases gap risk by 8.`,
        "assessment_answer",
        "field: aiEthicsPolicy",
      ),
    );
  } else if (boolYes(buyerPayload.aiEthicsPolicy)) {
    components.push(
      component(
        "AI Ethics Policy Confirmed",
        "OrgReadiness",
        0,
        `AI ethics policy confirmed — no penalty applied.`,
        "assessment_answer",
        "field: aiEthicsPolicy",
      ),
    );
  }

  const capacity = norm(buyerPayload.implementationCapacity ?? buyerPayload.implementationTeamComposition);
  if (capacity.includes("dedicated")) {
    risk -= 6;
    components.push(
      component(
        "Implementation Capacity: Dedicated team",
        "OrgReadiness",
        +(6 * W_ORG),
        `Implementation capacity "${buyerPayload.implementationCapacity}" — reduces organizational gap risk by 6.`,
        "assessment_answer",
        "field: implementationCapacity",
      ),
    );
  } else if (capacity.includes("shared")) {
    risk += 6;
    components.push(
      component(
        "Implementation Capacity: Shared workload",
        "OrgReadiness",
        -(6 * W_ORG),
        `Implementation capacity "${buyerPayload.implementationCapacity}" — increases organizational gap risk by 6.`,
        "assessment_answer",
        "field: implementationCapacity",
      ),
    );
  } else if (capacity.includes("no one assigned") || capacity.includes("no team")) {
    risk += 8;
    components.push(
      component(
        "Implementation Capacity: No owner",
        "OrgReadiness",
        -(8 * W_ORG),
        `Implementation capacity "${buyerPayload.implementationCapacity}" — increases organizational gap risk by 8.`,
        "assessment_answer",
        "field: implementationCapacity",
      ),
    );
  }

  const review = norm(buyerPayload.humanReviewLevel);
  if (review.includes("no review")) {
    risk += 8;
    components.push(
      component(
        "Human Review: None",
        "OrgReadiness",
        -(8 * W_ORG),
        `Human review "${buyerPayload.humanReviewLevel}" — increases gap risk by 8.`,
        "assessment_answer",
        "field: humanReviewLevel",
      ),
    );
  } else if (review.includes("exception")) {
    risk += 4;
    components.push(
      component(
        "Human Review: Exception-based",
        "OrgReadiness",
        -(4 * W_ORG),
        `Human review "${buyerPayload.humanReviewLevel}" — increases gap risk by 4.`,
        "assessment_answer",
        "field: humanReviewLevel",
      ),
    );
  } else if (review.startsWith("always")) {
    risk -= 4;
    components.push(
      component(
        "Human Review: Always",
        "OrgReadiness",
        +(4 * W_ORG),
        `Human review "${buyerPayload.humanReviewLevel}" — reduces gap risk by 4.`,
        "assessment_answer",
        "field: humanReviewLevel",
      ),
    );
  }

  const sensitivity = norm(buyerPayload.dataSensitivity);
  if (sensitivity.includes("extremely") || sensitivity.includes("highly sensitive")) {
    risk += 6;
    components.push(
      component(
        "Data Sensitivity: High",
        "OrgReadiness",
        -(6 * W_ORG),
        `Data sensitivity "${buyerPayload.dataSensitivity}" — increases gap risk by 6.`,
        "assessment_answer",
        "field: dataSensitivity",
      ),
    );
  } else if (sensitivity.includes("sensitive")) {
    risk += 3;
    components.push(
      component(
        "Data Sensitivity: Sensitive",
        "OrgReadiness",
        -(3 * W_ORG),
        `Data sensitivity "${buyerPayload.dataSensitivity}" — increases gap risk by 3.`,
        "assessment_answer",
        "field: dataSensitivity",
      ),
    );
  }

  // Criticality × Risk appetite (decision stakes / unavailability + appetite)
  const appetite = norm(buyerPayload.riskAppetite);
  const criticality = norm(buyerPayload.criticality);
  if (isHighStakes(criticality) && isAggressiveAppetite(appetite)) {
    risk += 8;
    components.push(
      component(
        "High Criticality + Aggressive Risk Appetite",
        "OrgReadiness",
        -(8 * W_ORG),
        `Criticality "${buyerPayload.criticality}" and risk appetite "${buyerPayload.riskAppetite}" — high-stakes combination increases gap risk by 8.`,
        "assessment_answer",
        "fields: criticality, riskAppetite",
      ),
    );
  } else if (isLowOrMediumStakes(criticality) && isConservativeAppetite(appetite)) {
    risk -= 2;
    components.push(
      component(
        "Low/Medium Criticality + Conservative Appetite",
        "OrgReadiness",
        +(2 * W_ORG),
        `Criticality "${buyerPayload.criticality}" and risk appetite "${buyerPayload.riskAppetite}" — low-risk combination reduces gap risk by 2.`,
        "assessment_answer",
        "fields: criticality, riskAppetite",
      ),
    );
  }

  const confidence = norm(buyerPayload.answerConfidence);
  if (confidence.startsWith("low")) {
    risk += 4;
    components.push(
      component(
        "Answer confidence: Low",
        "OrgReadiness",
        -(4 * W_ORG),
        `Answer confidence "${buyerPayload.answerConfidence}" — increases gap risk by 4.`,
        "assessment_answer",
        "field: answerConfidence",
      ),
    );
  } else if (confidence.startsWith("high")) {
    risk -= 2;
    components.push(
      component(
        "Answer confidence: High",
        "OrgReadiness",
        +(2 * W_ORG),
        `Answer confidence "${buyerPayload.answerConfidence}" — reduces gap risk by 2.`,
        "assessment_answer",
        "field: answerConfidence",
      ),
    );
  }

  // Clamping
  const computedRisk = Math.max(0, Math.min(100, risk));
  if (computedRisk !== risk) {
    warnings.push(
      `Organizational readiness gap was clamped from ${risk} to ${computedRisk} — trace component sum may not exactly reconcile.`,
    );
  }

  return { components, computedRisk, warnings };
}

// ── Integration Risk trace ─────────────────────────────────────────────────────

function traceIntegrationRisk(
  buyerPayload: Record<string, unknown>,
): { components: ScoreTraceComponent[]; computedRisk: number; warnings: string[] } {
  const components: ScoreTraceComponent[] = [];
  const warnings: string[] = [];
  let risk = 25;

  // Base
  components.push(
    component(
      "Integration Risk — base",
      "Integration",
      -(25 * W_INT),
      "All buyer assessments start with a base integration risk of 25.",
      "system_default",
      "scoring engine default",
    ),
  );

  // Integration systems
  const systems = parseList(buyerPayload.integrationSystems).filter((s) => {
    const n = norm(s);
    return !n.includes("no integration") && n !== "none";
  });
  const systemsDelta = Math.min(30, systems.length * 6);
  if (systems.length > 0) {
    risk += systemsDelta;
    components.push(
      component(
        `${systems.length} Integration System${systems.length > 1 ? "s" : ""}`,
        "Integration",
        -(systemsDelta * W_INT),
        `${systems.length} integration system(s) detected: ${systems.slice(0, 5).join(", ")}${systems.length > 5 ? " …" : ""} — adds ${systemsDelta} to integration risk (capped at +30).`,
        "assessment_answer",
        "field: integrationSystems",
      ),
    );
  }

  const usage = norm(buyerPayload.currentUsageState ?? buyerPayload.requirementGaps);
  if (usage.includes("not in use") || usage.startsWith("no")) {
    risk += 12;
    components.push(
      component(
        "Current usage: not in use",
        "Integration",
        -(12 * W_INT),
        `Current usage "${buyerPayload.currentUsageState ?? buyerPayload.requirementGaps}" — adds 12 to integration risk.`,
        "assessment_answer",
        "field: currentUsageState",
      ),
    );
  } else if (usage.includes("trial") || usage.includes("poc")) {
    risk += 4;
    components.push(
      component(
        "Current usage: trial/POC",
        "Integration",
        -(4 * W_INT),
        `Current usage "${buyerPayload.currentUsageState}" — adds 4 to integration risk.`,
        "assessment_answer",
        "field: currentUsageState",
      ),
    );
  } else if (usage.includes("unsanctioned")) {
    risk += 8;
    components.push(
      component(
        "Current usage: unsanctioned",
        "Integration",
        -(8 * W_INT),
        `Current usage "${buyerPayload.currentUsageState}" — adds 8 to integration risk.`,
        "assessment_answer",
        "field: currentUsageState",
      ),
    );
  } else if (usage.includes("officially in use") || usage.startsWith("yes")) {
    risk -= 3;
    components.push(
      component(
        "Current usage: in production",
        "Integration",
        +(3 * W_INT),
        `Current usage "${buyerPayload.currentUsageState}" — reduces integration risk by 3.`,
        "assessment_answer",
        "field: currentUsageState",
      ),
    );
  }

  const rollback = norm(buyerPayload.rollbackCapability);
  if (rollback.startsWith("none") || rollback.includes("no rollback") || rollback === "no") {
    risk += 12;
    components.push(
      component(
        `Rollback Capability: ${buyerPayload.rollbackCapability}`,
        "Integration",
        -(12 * W_INT),
        `Rollback capability "${buyerPayload.rollbackCapability}" indicates no rollback — adds 12 to integration risk.`,
        "assessment_answer",
        "field: rollbackCapability",
      ),
    );
  } else if (
    rollback.includes("manual") ||
    rollback.startsWith("moderate") ||
    rollback.startsWith("limited")
  ) {
    risk += 6;
    components.push(
      component(
        `Rollback Capability: ${buyerPayload.rollbackCapability}`,
        "Integration",
        -(6 * W_INT),
        `Rollback capability "${buyerPayload.rollbackCapability}" is manual/moderate/limited — adds 6 to integration risk.`,
        "assessment_answer",
        "field: rollbackCapability",
      ),
    );
  } else if (rollback.length > 0) {
    risk -= 3;
    components.push(
      component(
        `Rollback Capability: ${buyerPayload.rollbackCapability}`,
        "Integration",
        +(3 * W_INT),
        `Rollback capability "${buyerPayload.rollbackCapability}" appears automated/instant — reduces integration risk by 3.`,
        "assessment_answer",
        "field: rollbackCapability",
      ),
    );
  } else {
    const exp = norm(buyerPayload.dataExportCapability);
    if (exp.startsWith("no")) {
      risk += 12;
      components.push(
        component(
          "Exit/export: none",
          "Integration",
          -(12 * W_INT),
          `No rollback on file; data export "${buyerPayload.dataExportCapability}" used instead — adds 12.`,
          "assessment_answer",
          "field: dataExportCapability",
        ),
      );
    } else if (exp.startsWith("yes")) {
      risk += 6;
      components.push(
        component(
          "Exit/export: limited proxy for rollback",
          "Integration",
          -(6 * W_INT),
          `No rollback on file; data export "${buyerPayload.dataExportCapability}" used instead — adds 6.`,
          "assessment_answer",
          "field: dataExportCapability",
        ),
      );
    }
  }

  // Monitoring
  if (!boolYes(buyerPayload.monitoringDataAvailable)) {
    risk += 6;
    components.push(
      component(
        "Monitoring Data Not Available",
        "Integration",
        -(6 * W_INT),
        `Monitoring data field "${buyerPayload.monitoringDataAvailable ?? "(empty)"}" was not recognized as available — adds 6 to integration risk.`,
        "assessment_answer",
        "field: monitoringDataAvailable",
      ),
    );
  } else {
    components.push(
      component(
        "Monitoring Data Available",
        "Integration",
        0,
        "Monitoring data confirmed available — no penalty applied.",
        "assessment_answer",
        "field: monitoringDataAvailable",
      ),
    );
  }

  // Audit logs
  if (!boolYes(buyerPayload.auditLogsAvailable)) {
    risk += 6;
    components.push(
      component(
        "Audit Logs Not Available",
        "Integration",
        -(6 * W_INT),
        `Audit logs field "${buyerPayload.auditLogsAvailable ?? "(empty)"}" was not recognized as available — adds 6 to integration risk.`,
        "assessment_answer",
        "field: auditLogsAvailable",
      ),
    );
  } else {
    components.push(
      component(
        "Audit Logs Available",
        "Integration",
        0,
        "Audit logs confirmed available — no penalty applied.",
        "assessment_answer",
        "field: auditLogsAvailable",
      ),
    );
  }

  const access = parseList(buyerPayload.integrationAccessLevels).join(" ").toLowerCase();
  if (access.includes("admin") || access.includes("delete")) {
    risk += 6;
    components.push(
      component(
        "Integration access: admin/delete",
        "Integration",
        -(6 * W_INT),
        "Write+delete or admin access on an integration — adds 6 to integration risk.",
        "assessment_answer",
        "field: integrationAccessLevels",
      ),
    );
  } else if (access.includes("write")) {
    risk += 3;
    components.push(
      component(
        "Integration access: write",
        "Integration",
        -(3 * W_INT),
        "Read+write integration access — adds 3 to integration risk.",
        "assessment_answer",
        "field: integrationAccessLevels",
      ),
    );
  }

  const exposure = norm(buyerPayload.outputExposure);
  if (exposure.includes("published directly")) {
    risk += 6;
    components.push(
      component(
        "Output exposure: published directly",
        "Integration",
        -(6 * W_INT),
        `Output exposure "${buyerPayload.outputExposure}" — adds 6.`,
        "assessment_answer",
        "field: outputExposure",
      ),
    );
  } else if (exposure.includes("customer-facing")) {
    risk += 3;
    components.push(
      component(
        "Output exposure: customer-facing",
        "Integration",
        -(3 * W_INT),
        `Output exposure "${buyerPayload.outputExposure}" — adds 3.`,
        "assessment_answer",
        "field: outputExposure",
      ),
    );
  }

  const training = norm(buyerPayload.trainingUseOfData);
  if (norm(buyerPayload.trainingUseOfDataStance) === "dispute" || training.startsWith("yes")) {
    risk += 5;
    components.push(
      component(
        "Training use of data",
        "Integration",
        -(5 * W_INT),
        "Buyer data may train vendor models — adds 5 to integration risk.",
        "assessment_answer",
        "field: trainingUseOfData",
      ),
    );
  } else if (training.includes("not yet")) {
    risk += 3;
    components.push(
      component(
        "Training use of data unset",
        "Integration",
        -(3 * W_INT),
        "Training use of data is not yet established — adds 3.",
        "assessment_answer",
        "field: trainingUseOfData",
      ),
    );
  }

  const deployment = norm(buyerPayload.deploymentModel);
  if (deployment.includes("on-premise") || deployment.includes("private cloud")) {
    risk += 4;
    components.push(
      component(
        "Deployment model: private/on-prem",
        "Integration",
        -(4 * W_INT),
        `Deployment model "${buyerPayload.deploymentModel}" — adds 4.`,
        "assessment_answer",
        "field: deploymentModel",
      ),
    );
  }

  const pilot = norm(buyerPayload.pilotStatus);
  if (pilot.includes("did not meet")) {
    risk += 6;
    components.push(
      component(
        "Pilot did not meet criteria",
        "Integration",
        -(6 * W_INT),
        `Pilot status "${buyerPayload.pilotStatus}" — adds 6.`,
        "assessment_answer",
        "field: pilotStatus",
      ),
    );
  } else if (pilot.includes("not planned")) {
    risk += 4;
    components.push(
      component(
        "Pilot not planned",
        "Integration",
        -(4 * W_INT),
        `Pilot status "${buyerPayload.pilotStatus}" — adds 4.`,
        "assessment_answer",
        "field: pilotStatus",
      ),
    );
  } else if (pilot.includes("met criteria")) {
    risk -= 4;
    components.push(
      component(
        "Pilot met criteria",
        "Integration",
        +(4 * W_INT),
        `Pilot status "${buyerPayload.pilotStatus}" — reduces integration risk by 4.`,
        "assessment_answer",
        "field: pilotStatus",
      ),
    );
  }

  const users = norm(buyerPayload.usersInScope);
  if (users.includes("5,000+") || users.includes("5000+")) {
    risk += 4;
    components.push(
      component(
        "Users in scope: 5,000+",
        "Integration",
        -(4 * W_INT),
        `Users in scope "${buyerPayload.usersInScope}" — adds 4.`,
        "assessment_answer",
        "field: usersInScope",
      ),
    );
  } else if (users.includes("1-10")) {
    risk -= 2;
    components.push(
      component(
        "Users in scope: pilot",
        "Integration",
        +(2 * W_INT),
        `Users in scope "${buyerPayload.usersInScope}" — reduces integration risk by 2.`,
        "assessment_answer",
        "field: usersInScope",
      ),
    );
  }

  if (norm(buyerPayload.trainingEffort).includes("multi-day")) {
    risk += 3;
    components.push(
      component(
        "Training effort: multi-day",
        "Integration",
        -(3 * W_INT),
        `Training effort "${buyerPayload.trainingEffort}" — adds 3.`,
        "assessment_answer",
        "field: trainingEffort",
      ),
    );
  }

  if (parseList(buyerPayload.contractsInPlace).some((c) => norm(c).includes("nothing signed"))) {
    risk += 4;
    components.push(
      component(
        "No contract signed",
        "Integration",
        -(4 * W_INT),
        "Nothing signed yet with the vendor — adds 4.",
        "assessment_answer",
        "field: contractsInPlace",
      ),
    );
  }

  if (parseList(buyerPayload.useCaseTypes).some((x) => norm(x).includes("automatically"))) {
    risk += 4;
    components.push(
      component(
        "Autonomous action use case",
        "Integration",
        -(4 * W_INT),
        "Use case includes taking an action automatically — adds 4.",
        "assessment_answer",
        "field: useCaseTypes",
      ),
    );
  }

  // Testing results
  if (!boolYes(buyerPayload.testingResultsAvailable)) {
    risk += 6;
    components.push(
      component(
        "Testing Results Not Available",
        "Integration",
        -(6 * W_INT),
        `Testing results field "${buyerPayload.testingResultsAvailable ?? "(empty)"}" was not recognized as available — adds 6 to integration risk.`,
        "assessment_answer",
        "field: testingResultsAvailable",
      ),
    );
  } else {
    components.push(
      component(
        "Testing Results Available",
        "Integration",
        0,
        "Testing results confirmed available — no penalty applied.",
        "assessment_answer",
        "field: testingResultsAvailable",
      ),
    );
  }

  const computedRisk = Math.max(0, Math.min(100, risk));
  if (computedRisk !== risk) {
    warnings.push(
      `Integration risk was clamped from ${risk} to ${computedRisk} — trace component sum may not exactly reconcile.`,
    );
  }

  return { components, computedRisk, warnings };
}

// ── Public entry point ─────────────────────────────────────────────────────────

export type IrsTraceInput = {
  /** Buyer payload reconstructed from DB columns (camelCase keys). */
  buyerPayload: Record<string, unknown>;
  /** Stored implementationRiskBreakdown from vendor_risk_assessment_report. */
  storedBreakdown: {
    vendorRisk: number;
    organizationalReadinessGap: number;
    integrationRisk: number;
    vendorTrustScore: number;
    /** AI Risk Intellect intent multiplier when present (default 1.0). */
    intentMultiplier?: number;
  };
  /** Stored final IRS from vendor_risk_assessment_report.implementationRiskScore. */
  storedScore: number;
  /** Whether a vendor attestation was linked when the report was generated. */
  usedAttestation: boolean;
  vendorName: string;
  productName: string;
  /** When the stored IRS was calculated (report generatedAt / irsRescoredAt / row timestamps). */
  generatedAt?: string | Date | null;
  /** Linked vendor attestation, used when rollback/monitoring/testing live there. */
  attestationRow?: Record<string, unknown> | null;
  /** Python irs-2.x scoring detail. Preferred source for explainability. */
  scoringDetail?: Record<string, unknown> | null;
  /** Python scoring version for the stored/live IRS calculation. */
  scoringVersion?: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function finiteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function componentName(raw: string): string {
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pythonSourceForCategory(category: string): ScoreTraceComponent["sourceType"] {
  return category === "VendorRisk" ? "vendor_attestation" : "assessment_answer";
}

function pythonSourceForComponent(
  category: string,
  row: Record<string, unknown>,
): ScoreTraceComponent["sourceType"] {
  if (category === "VendorRisk" && row.default_disclosed === true) return "system_default";
  return pythonSourceForCategory(category);
}

function pythonFieldForComponent(category: string, name: string): string {
  const map: Record<string, string> = {
    base: "vendorTrustScore, riskAppetite",
    maturity_gap: "vendorMaturity, buyerEmployeeCount, vendorEmployeeCount",
    cert_gap: "regulatoryRequirements, vendorCertifications, vendorEvidenceReceived",
    track_record: "airiRecords",
    financial: "financialPosition, retentionRate, enterpriseCustomers",
    ai_gov: "aiGovernanceMaturity, decisionStakes, humanReviewLevel",
    data_gov: "dataGovernanceMaturity, dataSensitivity, trainingUseOfData",
    skills: "aiSkillsAvailability, implementationCapacity, integrationSystems",
    change_mgmt: "changeManagementCapability, usersInScope, outputExposure",
    budget_realism: "budgetRange, vendorContractValueBand, deploymentModel",
    technical: "integrationSystems, integrationAccessLevels",
    use_case_gap: "useCaseTypes, vendorAiCapabilities",
    deployment_fit: "deploymentModel, vendorHosting, dataSubjectJurisdictions",
    lock_in: "dataExportCapability, contractsInPlace, contractNoticePeriod",
    rollback: "rollbackCapability, unavailabilityImpact, pilotStatus",
    scaling: "usersInScope, vendorDeploymentScale, pilotStatus",
  };
  if (category === "VendorRisk" && name === "base") return "vendorTrustScore";
  return map[name] ?? name;
}

function addMissingEvidenceForPythonFactor(
  out: string[],
  label: string,
  category: string,
  riskValue: number,
): void {
  if (riskValue < 15) return;
  const subject = `${label} is contributing ${round2(riskValue)} risk points`;
  if (category === "VendorRisk") {
    out.push(`${subject} — improve vendor trust evidence, certifications, maturity, or financial/track-record signals.`);
  } else if (category === "OrgReadiness") {
    out.push(`${subject} — strengthen buyer readiness inputs such as governance, skills, change management, or budget realism.`);
  } else {
    out.push(`${subject} — reduce implementation complexity through better deployment fit, rollback, integration, scaling, or lock-in controls.`);
  }
}

function componentsFromPythonPillar(opts: {
  pillar: Record<string, unknown> | null;
  pillarWeight: number;
  category: "VendorRisk" | "OrgReadiness" | "Integration";
  labelPrefix: string;
  sourceLabelPrefix?: string;
  missingEvidence: string[];
}): ScoreTraceComponent[] {
  const { pillar, pillarWeight, category, labelPrefix, sourceLabelPrefix, missingEvidence } = opts;
  const rows = Array.isArray(pillar?.components) ? pillar.components : [];
  const redistributed = asRecord(pillar?.redistributed_weights) ?? {};
  const components: ScoreTraceComponent[] = [];

  for (const rowRaw of rows) {
    const row = asRecord(rowRaw);
    if (!row || row.included !== true) continue;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const value = finiteNumber(row.value);
    if (value == null) continue;
    const leafWeight = finiteNumber(redistributed[name]) ?? finiteNumber(row.weight) ?? 0;
    if (leafWeight <= 0 || pillarWeight <= 0) continue;

    const impact = -(value * leafWeight * pillarWeight);
    const label = `${labelPrefix}: ${componentName(name)}`;
    const reasonRaw = String(row.reason ?? "").trim();
    const reason =
      reasonRaw && reasonRaw !== "no_input"
        ? `${label} risk = ${round2(value)}. ${reasonRaw}`
        : `${label} risk = ${round2(value)}. Contribution uses Python irs-2.x redistributed leaf weight ${Math.round(leafWeight * 100)}% and pillar weight ${Math.round(pillarWeight * 100)}%.`;
    components.push(
      component(
        label,
        category,
        impact,
        reason,
        pythonSourceForComponent(category, row),
        `${sourceLabelPrefix ?? "field"}: ${pythonFieldForComponent(category, name)}`,
      ),
    );
    addMissingEvidenceForPythonFactor(missingEvidence, label, category, value);
  }

  return components;
}

function buildIrsScoreTraceFromPythonDetail(input: IrsTraceInput): ScoreTrace | null {
  const detail = asRecord(input.scoringDetail);
  if (!detail) return null;
  const finalFormula = asRecord(detail.final_formula);
  if (!finalFormula) return null;
  const weights = asRecord(finalFormula?.weights);
  if (!weights) return null;

  const vendorWeight = finiteNumber(weights.vendor_risk) ?? W_VENDOR;
  const orgWeight = finiteNumber(weights.organizational_readiness) ?? W_ORG;
  const integrationWeight = finiteNumber(weights.integration_risk) ?? W_INT;
  const warnings: string[] = [];
  const missingEvidence: string[] = [];
  const storedBreakdown = input.storedBreakdown;
  const storedScore = Math.round(Math.max(0, Math.min(100, input.storedScore)));

  if (!input.usedAttestation) {
    warnings.push(
      `Vendor Trust Score defaulted to ${storedBreakdown.vendorTrustScore} — no linked attestation found for ${input.vendorName} / ${input.productName}. Actual readiness may differ significantly.`,
    );
    missingEvidence.push("Vendor attestation not linked — linking an attestation could significantly change the readiness score.");
  }

  const computedScore = finiteNumber(finalFormula.score);
  if (computedScore != null && Math.abs(Math.round(computedScore) - storedScore) >= 1) {
    warnings.push(
      `Stored readiness score is ${storedScore}; Python irs-2.x detail computes ${Math.round(computedScore)} from the current scoring detail. The headline uses the stored score so it matches the assessment card.`,
    );
  }

  const orgGap = finiteNumber(storedBreakdown.organizationalReadinessGap) ?? 0;
  const integrationRisk = finiteNumber(storedBreakdown.integrationRisk) ?? 0;
  const vendorTrustScore = finiteNumber(storedBreakdown.vendorTrustScore) ?? 50;

  const components: ScoreTraceComponent[] = [
    ...componentsFromPythonPillar({
      pillar: asRecord(detail.vendor_risk),
      pillarWeight: vendorWeight,
      category: "VendorRisk",
      labelPrefix: "Vendor Risk",
      sourceLabelPrefix: "field",
      missingEvidence,
    }),
    ...componentsFromPythonPillar({
      pillar: asRecord(detail.organizational_readiness_gap),
      pillarWeight: orgWeight,
      category: "OrgReadiness",
      labelPrefix: "Organizational Readiness",
      sourceLabelPrefix: "field",
      missingEvidence,
    }),
    ...componentsFromPythonPillar({
      pillar: asRecord(detail.integration_risk),
      pillarWeight: integrationWeight,
      category: "Integration",
      labelPrefix: "Integration Risk",
      sourceLabelPrefix: "field",
      missingEvidence,
    }),
  ];

  const dispute = asRecord(asRecord(detail.vendor_risk)?.dispute);
  const disputeValue = finiteNumber(dispute?.value) ?? 0;
  if (disputeValue > 0 && vendorWeight > 0) {
    components.push(
      component(
        "Vendor Risk: Disputed Evidence Adjustment",
        "VendorRisk",
        -(disputeValue * vendorWeight),
        `Disputed evidence added ${round2(disputeValue)} vendor-risk points before the IRS calculation.`,
        "assessment_answer",
        "field: trainingUseOfDataStance, monitoringDataStance, auditLogsStance, dataExportStance",
      ),
    );
  }

  return {
    scoreType: "buyer_implementation_risk",
    finalScore: storedScore,
    formula: "",
    scoringVersion: input.scoringVersion?.trim() || "irs-2.0",
    rawSubScores: {
      vendorRisk: finiteNumber(storedBreakdown.vendorRisk) ?? 0,
      orgReadinessGap: orgGap,
      integrationRisk,
      vendorTrustScore,
    },
    components,
    warnings,
    missingEvidence,
    generatedAt: toIsoTimestamp(input.generatedAt) ?? new Date().toISOString(),
    internalOnly: true,
  };
}

export function buildIrsScoreTrace(input: IrsTraceInput): ScoreTrace {
  const pythonTrace = buildIrsScoreTraceFromPythonDetail(input);
  if (pythonTrace) return pythonTrace;

  const { buyerPayload, storedBreakdown, storedScore, usedAttestation, vendorName, productName } = input;
  const warnings: string[] = [];
  const missingEvidence: string[] = [];

  const resolvedPayload = resolveBuyerIrsInputs(buyerPayload, input.attestationRow ?? null);
  // ── Vendor Risk component ────────────────────────────────────────────────────
  const vtScore = storedBreakdown.vendorTrustScore;
  const vRisk = storedBreakdown.vendorRisk;
  const vendorComponents: ScoreTraceComponent[] = [];

  if (!usedAttestation) {
    warnings.push(
      `Vendor Trust Score defaulted to ${vtScore} — no linked attestation found for ${vendorName} / ${productName}. Actual risk may differ significantly.`,
    );
    vendorComponents.push(
      component(
        `Vendor Trust Score: ${vtScore} (default — no attestation)`,
        "VendorRisk",
        -(vRisk * W_VENDOR),
        `No vendor attestation was linked at the time of scoring. VTS defaulted to ${vtScore}; vendor risk = ${vRisk}. Contribution: −(${vRisk} × 0.35) = ${round2(-(vRisk * W_VENDOR))}.`,
        "system_default",
        `vendor: ${vendorName} / product: ${productName}`,
      ),
    );
    missingEvidence.push(
      `Vendor attestation not linked — linking an attestation could significantly change the score.`,
    );
  } else {
    vendorComponents.push(
      component(
        `Vendor Trust Score: ${vtScore}`,
        "VendorRisk",
        -(vRisk * W_VENDOR),
        `VTS = ${vtScore}; vendor risk = 100 − ${vtScore} = ${vRisk}. Contribution: −(${vRisk} × 0.35) = ${round2(-(vRisk * W_VENDOR))}.`,
        "vendor_attestation",
        `vendor: ${vendorName} / product: ${productName}`,
      ),
    );
  }

  // ── Org Readiness Gap trace ──────────────────────────────────────────────────
  const orgTrace = traceOrgReadinessGap(resolvedPayload);
  warnings.push(...orgTrace.warnings);

  // ── Integration Risk trace ────────────────────────────────────────────────────
  const intTrace = traceIntegrationRisk(resolvedPayload);
  warnings.push(...intTrace.warnings);

  // ── Missing evidence hints ────────────────────────────────────────────────────
  if (!isEmpty(resolvedPayload.aiGovernanceBoard) && !boolYes(resolvedPayload.aiGovernanceBoard)) {
    missingEvidence.push(
      "AI Governance Board not confirmed — confirming it would reduce org readiness gap by 8 points (+2.8 IRS).",
    );
  }
  if (!isEmpty(resolvedPayload.aiEthicsPolicy) && !boolYes(resolvedPayload.aiEthicsPolicy)) {
    missingEvidence.push(
      "AI Ethics Policy not confirmed — confirming it would reduce org readiness gap by 8 points (+2.8 IRS).",
    );
  }
  if (!boolYes(resolvedPayload.auditLogsAvailable)) {
    missingEvidence.push(
      "Audit logs not confirmed — confirming would reduce integration risk by 6 points (+1.8 IRS).",
    );
  }
  if (!boolYes(resolvedPayload.monitoringDataAvailable)) {
    missingEvidence.push(
      "Monitoring data not confirmed — confirming would reduce integration risk by 6 points (+1.8 IRS).",
    );
  }
  if (!boolYes(resolvedPayload.testingResultsAvailable)) {
    missingEvidence.push(
      "Testing results not confirmed — confirming would reduce integration risk by 6 points (+1.8 IRS).",
    );
  }

  // ── Reconciliation check ──────────────────────────────────────────────────────
  const recomputedOrg = orgTrace.computedRisk;
  const recomputedInt = intTrace.computedRisk;
  const storedOrg = storedBreakdown.organizationalReadinessGap;
  const storedInt = storedBreakdown.integrationRisk;

  if (Math.abs(recomputedOrg - storedOrg) > 1) {
    warnings.push(
      `Org readiness gap reconciliation mismatch: trace computed ${recomputedOrg}, stored value is ${storedOrg}. ` +
        `Usually means this assessment was scored before irs-1.1 (form labels / Yes-* handling). ` +
        `Re-open Score Trace to auto-refresh stored IRS, or resubmit the assessment.`,
    );
  }
  if (Math.abs(recomputedInt - storedInt) > 1) {
    warnings.push(
      `Integration risk reconciliation mismatch: trace computed ${recomputedInt}, stored value is ${storedInt}. ` +
        `Same cause — stored breakdown is from an older scoring pass; refresh Score Trace or resubmit.`,
    );
  }

  // Canonical readiness score from stored breakdown (same helper as Python / buyer UI).
  const intentMultiplier =
    Number.isFinite(Number(storedBreakdown.intentMultiplier)) &&
    Number(storedBreakdown.intentMultiplier) > 0
      ? Number(storedBreakdown.intentMultiplier)
      : 1.0;
  const { score: canonicalIrs } = irsFinalScoreFromParts(
    vRisk,
    storedOrg,
    storedInt,
    intentMultiplier,
  );
  if (Math.abs(canonicalIrs - storedScore) >= 1) {
    warnings.push(
      `Stored score is ${storedScore}; canonical formula from breakdown is ${canonicalIrs}. ` +
        `Explainability headline uses the stored score so it matches the assessment card.`,
    );
  }

  const allComponents: ScoreTraceComponent[] = [
    ...vendorComponents,
    ...orgTrace.components,
    ...intTrace.components,
  ];

  return {
    scoreType: "buyer_implementation_risk",
    finalScore: Math.round(Math.max(0, Math.min(100, storedScore))),
    formula: "",
    scoringVersion: SCORING_VERSION,
    rawSubScores: {
      vendorRisk: vRisk,
      orgReadinessGap: storedOrg,
      integrationRisk: storedInt,
      vendorTrustScore: vtScore,
      intentMultiplier,
    },
    components: allComponents,
    warnings,
    missingEvidence,
    generatedAt: toIsoTimestamp(input.generatedAt) ?? new Date().toISOString(),
    internalOnly: true,
  };
}
