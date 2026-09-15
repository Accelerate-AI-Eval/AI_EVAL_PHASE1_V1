"""Buyer Implementation Readiness Score (Type 3) — Documents 0 and 3."""

from __future__ import annotations

import json
import math
import re
from typing import Any


def _clamp01(v: float) -> float:
    if not math.isfinite(v):
        return 0.0
    return max(0.0, min(100.0, v))


def _norm(v: Any) -> str:
    return str(v if v is not None else "").strip().lower()


def _bool_yes(v: Any) -> bool:
    """True for bare yes/true and Buyer COTS options like 'Yes - Active board…'."""
    if isinstance(v, bool):
        return v
    s = _norm(v)
    return s.startswith("yes") or s in ("true", "available", "exists", "defined")


def _is_empty(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, (list, dict)) and len(v) == 0:
        return True
    return str(v).strip() in ("", "none", "null", "undefined")


def _first_present(*values: Any) -> Any:
    for v in values:
        if not _is_empty(v):
            return v
    return None


def _parse_list(v: Any) -> list[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, dict):
        out: list[str] = []
        for key, val in v.items():
            if isinstance(val, str) and val.strip():
                out.append(f"{key}:{val.strip()}")
            elif _bool_yes(val) or (not _is_empty(val) and not isinstance(val, bool)):
                out.append(str(key).strip())
        return [x for x in out if x]
    if isinstance(v, str):
        t = v.strip()
        if not t:
            return []
        try:
            parsed = json.loads(t)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
            if isinstance(parsed, dict):
                return _parse_list(parsed)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return [x.strip() for x in re.split(r",|;|\r?\n", t) if x.strip()]
    return []


def _attestation_get(attestation_row: dict[str, Any] | None, *keys: str) -> Any:
    if not isinstance(attestation_row, dict):
        return None
    lowered = {str(k).strip().lower(): v for k, v in attestation_row.items()}
    for key in keys:
        got = attestation_row.get(key)
        if not _is_empty(got):
            return got
        got = lowered.get(key.lower())
        if not _is_empty(got):
            return got
    for value in attestation_row.values():
        if not isinstance(value, dict):
            continue
        nested_lower = {str(k).strip().lower(): v for k, v in value.items()}
        for key in keys:
            got = value.get(key)
            if not _is_empty(got):
                return got
            got = nested_lower.get(key.lower())
            if not _is_empty(got):
                return got
    return None


def _vts_from_evidence(evidence: Any) -> float | None:
    items = [_norm(x) for x in _parse_list(evidence)]
    if not items or any("nothing yet" in x for x in items):
        return None
    score = 55.0
    blob = " ".join(items)
    if "soc 2" in blob:
        score += 8
    if "iso 27001" in blob:
        score += 6
    if "iso 42001" in blob:
        score += 6
    if "pen-test" in blob or "pen test" in blob:
        score += 4
    if "baa" in blob or "dpa" in blob:
        score += 3
    return _clamp01(min(score, 78.0))


def _extract_vendor_trust_score(
    attestation_row: dict[str, Any] | None,
    evidence: Any = None,
) -> float:
    """
    Same resolution order as Product Profile UI / Node extractVendorTrustScore:
    1) trustScore.overallScore (> 0)
    2) latest_trust_score on attestation (> 0)
    3) formula.vendor_trust_score / report.vendor_trust_score (> 0)
    4) buyer-held vendor evidence (instead of a hardcoded 50)
    5) default 50
    """
    if attestation_row:
        report = attestation_row.get("generated_profile_report")
        if not isinstance(report, dict):
            report = {}
        trust_score = report.get("trustScore")
        if not isinstance(trust_score, dict):
            trust_score = report.get("trust_score") if isinstance(report.get("trust_score"), dict) else {}
        if not isinstance(trust_score, dict):
            trust_score = {}
        formula = report.get("formula")
        if not isinstance(formula, dict):
            formula = {}

        def _positive(raw: Any) -> float | None:
            try:
                n = float(raw)
            except (TypeError, ValueError):
                return None
            if math.isfinite(n) and n > 0:
                return _clamp01(round(n))
            return None

        for candidate in (
            trust_score.get("overallScore"),
            trust_score.get("overall_score"),
            attestation_row.get("latest_trust_score"),
            attestation_row.get("latestTrustScore"),
            formula.get("vendor_trust_score"),
            formula.get("formula_vendor_trust_score"),
            report.get("vendor_trust_score"),
        ):
            got = _positive(candidate)
            if got is not None:
                return got

        for candidate in (
            trust_score.get("overallScore"),
            trust_score.get("overall_score"),
            attestation_row.get("latest_trust_score"),
        ):
            try:
                n = float(candidate)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                continue
            if math.isfinite(n) and n == 0:
                return 0.0

    from_evidence = _vts_from_evidence(evidence)
    if from_evidence is not None:
        return from_evidence
    return 50.0


def _is_high_stakes(criticality: str) -> bool:
    return any(
        token in criticality
        for token in (
            "life or death",
            "major financial",
            "high",
            "critical",
            "work stops",
            "mission",
        )
    )


def _is_low_or_medium_stakes(criticality: str) -> bool:
    return any(
        token in criticality
        for token in (
            "low impact",
            "minimal",
            "moderate impact",
            "medium",
            "low",
            "work continues",
            "additive",
            "work degrades",
        )
    )


def _is_aggressive_appetite(appetite: str) -> bool:
    return (
        "aggressive" in appetite
        or "very high" in appetite
        or appetite.startswith("high")
    )


def _is_conservative_appetite(appetite: str) -> bool:
    return (
        "conservative" in appetite
        or "very low" in appetite
        or appetite.startswith("low")
    )


def _digital_from_onboarding(p: dict[str, Any]) -> Any:
    skills = _norm(p.get("aiSkillsAvailability"))
    initiatives = _norm(
        _first_present(p.get("existingAIInitiatives"), p.get("existingAiInitiatives"))
    )
    if (
        "expert" in skills
        or "ai-native" in initiatives
        or "extensive" in initiatives
    ):
        return "Level 5 - Fully digitized, AI-ready infrastructure"
    if "strong" in skills or "moderate" in skills:
        return "Level 4 - Advanced digital capabilities, data-driven"
    if "limited" in skills:
        return "Level 2 - Basic digital systems, limited integration"
    if skills.startswith("none"):
        return "Level 1 - Paper-based or minimal digital systems"
    return None


def _board_from_onboarding(maturity: Any) -> Any:
    s = _norm(maturity)
    if not s:
        return None
    if "board" in s or "oversight committee" in s or "optimized" in s:
        return "Yes - Active board with defined responsibilities"
    if s.startswith("none"):
        return "No - Not currently planned"
    return None


def _ethics_from_onboarding(maturity: Any) -> Any:
    s = _norm(maturity)
    if not s:
        return None
    if s.startswith("none"):
        return "No - Not currently developed"
    if any(token in s for token in ("documented", "basic", "intermediate", "advanced", "optimized")):
        return "Yes - Comprehensive policy actively enforced"
    return None


def _effective_available(value: Any, stance: Any) -> bool:
    if _norm(stance) == "dispute":
        return False
    return _bool_yes(value)


def _has_testing_evidence(evidence: Any) -> bool:
    blob = " ".join(_norm(x) for x in _parse_list(evidence))
    return any(
        token in blob
        for token in ("testing results", "pen-test", "pen test", "model or safety")
    )


def resolve_buyer_irs_inputs(
    buyer_payload: dict[str, Any],
    attestation_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Map V2 buyer COTS + onboarding + attestation onto formula inputs."""
    p = buyer_payload if isinstance(buyer_payload, dict) else {}
    a = attestation_row if isinstance(attestation_row, dict) else None

    digital = _first_present(
        p.get("digitalMaturityLevel"),
        p.get("digital_maturity"),
        _digital_from_onboarding(p),
    )
    governance = _first_present(
        p.get("dataGovernanceMaturity"),
        p.get("data_governance_maturity"),
        p.get("governance_maturity"),
    )
    ai_maturity = _first_present(p.get("aiGovernanceMaturity"), p.get("ai_governance_maturity"))
    board = _first_present(
        p.get("aiGovernanceBoard"),
        p.get("ai_governance_board"),
        _board_from_onboarding(ai_maturity),
    )
    ethics = _first_present(
        p.get("aiEthicsPolicy"),
        p.get("ai_ethics_policy"),
        _ethics_from_onboarding(ai_maturity),
    )
    capacity = _first_present(
        p.get("implementationCapacity"),
        p.get("implementation_capacity"),
        p.get("implementationTeamComposition"),
        p.get("team_composition"),
    )
    criticality = _first_present(
        p.get("decisionStakes"),
        p.get("criticality"),
        p.get("unavailabilityImpact"),
        p.get("unavailability_impact"),
    )
    usage = _first_present(
        p.get("currentUsageState"),
        p.get("current_usage_state"),
        p.get("requirementGaps"),
        p.get("gap_requirement_product"),
    )
    rollback = _first_present(
        p.get("rollbackCapability"),
        p.get("rollback_capability"),
        _attestation_get(a, "rollback_capability", "rollbackCapability"),
    )
    monitoring = _first_present(
        p.get("monitoringDataAvailable"),
        p.get("vendor_usage_data"),
        _attestation_get(a, "production_model_monitoring", "monitoring_data_available"),
    )
    audit = _first_present(
        p.get("auditLogsAvailable"),
        p.get("audit_logs"),
        _attestation_get(a, "audit_logs_available", "auditLogsAvailable", "audit_logs"),
    )
    testing = _first_present(
        p.get("testingResultsAvailable"),
        p.get("testing_results"),
        _attestation_get(a, "testing_results_available", "testingResultsAvailable"),
    )
    evidence = _first_present(
        p.get("vendorEvidenceReceived"),
        p.get("vendor_evidence_received"),
        p.get("vendorCertifications"),
    )
    if _is_empty(testing) and _has_testing_evidence(evidence):
        testing = "Yes - Internal testing results provided"

    return {
        "digitalMaturityLevel": digital,
        "dataGovernanceMaturity": governance,
        "aiGovernanceBoard": board,
        "aiEthicsPolicy": ethics,
        "implementationCapacity": capacity,
        "implementationTeamComposition": p.get("implementationTeamComposition")
        if not _is_empty(p.get("implementationTeamComposition"))
        else capacity,
        "riskAppetite": _first_present(
            p.get("riskAppetite"), p.get("risk_appetite"), p.get("aiRiskAppetite")
        ),
        "criticality": criticality,
        "decisionStakes": p.get("decisionStakes"),
        "unavailabilityImpact": _first_present(
            p.get("unavailabilityImpact"), p.get("unavailability_impact")
        ),
        "integrationSystems": _first_present(
            p.get("integrationSystems"), p.get("integrate_system")
        ),
        "integrationAccessLevels": _first_present(
            p.get("integrationAccessLevels"), p.get("integration_access_levels")
        ),
        "currentUsageState": usage,
        "requirementGaps": usage,
        "rollbackCapability": rollback,
        "monitoringDataAvailable": monitoring,
        "monitoringDataStance": _first_present(
            p.get("monitoringDataStance"), p.get("monitoring_data_stance")
        ),
        "auditLogsAvailable": audit,
        "auditLogsStance": _first_present(p.get("auditLogsStance"), p.get("audit_logs_stance")),
        "testingResultsAvailable": testing,
        "dataSensitivity": _first_present(
            p.get("dataSensitivity"), p.get("data_sensitivity_level")
        ),
        "dataClasses": _first_present(p.get("dataClasses"), p.get("data_classes")),
        "humanReviewLevel": _first_present(
            p.get("humanReviewLevel"), p.get("human_review_level")
        ),
        "outputExposure": _first_present(p.get("outputExposure"), p.get("output_exposure")),
        "trainingUseOfData": _first_present(
            p.get("trainingUseOfData"), p.get("training_use_of_data")
        ),
        "trainingUseOfDataStance": _first_present(
            p.get("trainingUseOfDataStance"), p.get("training_use_of_data_stance")
        ),
        "deploymentModel": _first_present(p.get("deploymentModel"), p.get("deployment_model")),
        "pilotStatus": _first_present(p.get("pilotStatus"), p.get("pilot_status")),
        "usersInScope": _first_present(p.get("usersInScope"), p.get("users_in_scope")),
        "trainingEffort": _first_present(p.get("trainingEffort"), p.get("training_effort")),
        "vendorEvidenceReceived": evidence,
        "dataExportCapability": _first_present(
            p.get("dataExportCapability"), p.get("data_export_capability")
        ),
        "dataExportStance": _first_present(
            p.get("dataExportStance"), p.get("data_export_stance")
        ),
        "contractsInPlace": _first_present(
            p.get("contractsInPlace"), p.get("contracts_in_place")
        ),
        "answerConfidence": _first_present(
            p.get("answerConfidence"), p.get("answer_confidence")
        ),
        "accountableOwnerName": _first_present(
            p.get("accountableOwnerName"), p.get("accountable_owner_name")
        ),
        "useCaseTypes": _first_present(p.get("useCaseTypes"), p.get("use_case_types")),
        "aiGovernanceMaturity": ai_maturity,
        "aiSkillsAvailability": _first_present(
            p.get("aiSkillsAvailability"), p.get("ai_skills_availability")
        ),
        "changeManagementCapability": _first_present(
            p.get("changeManagementCapability"), p.get("change_management_capability")
        ),
        "regulatoryPenaltyExposure": _first_present(
            p.get("regulatoryPenaltyExposure"), p.get("regulatory_penalty_exposure")
        ),
        "regulatoryRequirements": _first_present(
            p.get("regulatoryRequirements"), p.get("regulatory_requirements")
        ),
        "decisionDomains": _first_present(p.get("decisionDomains"), p.get("decision_domains")),
        "aiDisclosure": _first_present(p.get("aiDisclosure"), p.get("ai_disclosure")),
        "accountableOwnerRole": _first_present(
            p.get("accountableOwnerRole"), p.get("accountable_owner_role")
        ),
        "dataSubjectJurisdictions": _first_present(
            p.get("dataSubjectJurisdictions"), p.get("data_subject_jurisdictions")
        ),
        "retentionRequirement": _first_present(
            p.get("retentionRequirement"), p.get("retention_requirement")
        ),
        "budgetRange": _first_present(p.get("budgetRange"), p.get("budget_range")),
        "contractNoticePeriod": _first_present(
            p.get("contractNoticePeriod"), p.get("contract_notice_period")
        ),
        "cloudProvider": _first_present(p.get("cloudProvider"), p.get("cloud_provider")),
        "existingTechnologyStack": _first_present(
            p.get("existingTechnologyStack"), p.get("existing_technology_stack"), p.get("techStack")
        ),
        "industrySector": _first_present(p.get("industrySector"), p.get("industry_sector")),
        "buyerEmployeeCount": _first_present(
            p.get("employeeCount"), p.get("buyerEmployeeCount"), p.get("organizationSize")
        ),
        "vendorMaturity": _first_present(
            p.get("vendorMaturity"),
            _attestation_get(a, "vendorMaturity", "vendor_maturity", "company_stage"),
        ),
        "vendorEmployeeCount": _first_present(
            p.get("vendorEmployeeCount"),
            _attestation_get(a, "employeeCount", "employee_count"),
        ),
        "vendorTargetIndustries": _first_present(
            p.get("vendorTargetIndustries"),
            _attestation_get(a, "target_industries", "targetIndustries", "sector"),
        ),
        "vendorCertifications": _first_present(
            p.get("vendorAttestedCertifications"),
            _attestation_get(a, "security_certifications", "certifications", "security_compliance_certificates"),
        ),
        "vendorClaimedCerts": _attestation_get(
            a, "security_certifications", "certifications", "security_compliance_certificates"
        ),
        "financialPosition": _first_present(
            p.get("financialPosition"),
            _attestation_get(a, "financialPosition", "financial_position"),
        ),
        "retentionRate": _first_present(
            p.get("retentionRate"),
            _attestation_get(a, "customer_retention_rate", "retentionRate", "retention"),
        ),
        "enterpriseCustomers": _first_present(
            p.get("enterpriseCustomers"),
            _attestation_get(a, "enterpriseCustomers", "enterprise_customers"),
        ),
        "fundingStatus": _first_present(
            p.get("fundingStatus"),
            _attestation_get(a, "fundingStatus", "funding_status"),
        ),
        "vendorHosting": _first_present(
            p.get("vendorHosting"),
            _attestation_get(a, "hostingType", "hosting_type", "hosting_options", "deployment_model"),
        ),
        "vendorResidencyOptions": _first_present(
            p.get("vendorResidencyOptions"),
            _attestation_get(a, "data_residency_options", "dataResidencyOptions"),
        ),
        "tenantIsolationModel": _first_present(
            p.get("tenantIsolationModel"),
            _attestation_get(a, "tenant_isolation_model", "tenantIsolationModel"),
        ),
        "vendorCustomization": _first_present(
            p.get("vendorCustomization"),
            _attestation_get(a, "deployment_customization", "customizationLevel"),
        ),
        "vendorAiCapabilities": _first_present(
            p.get("vendorAiCapabilities"),
            _attestation_get(a, "ai_capabilities", "aiCapabilities"),
        ),
        "vendorDecisionAutonomy": _first_present(
            p.get("vendorDecisionAutonomy"),
            _attestation_get(a, "decision_autonomy", "decisionAutonomyLevel"),
        ),
        "vendorModelTypes": _first_present(
            p.get("vendorModelTypes"),
            _attestation_get(a, "model_types", "modelTypes"),
        ),
        "vendorDeploymentScale": _first_present(
            p.get("vendorDeploymentScale"),
            _attestation_get(a, "deployment_scale", "deploymentScale"),
        ),
        "vendorContractValueBand": _first_present(
            p.get("vendorContractValueBand"),
            _attestation_get(a, "annual_contract_value", "annualContractValue", "acv_band"),
        ),
        "airiRecords": p.get("airiRecords") or _attestation_get(a, "airiRecords", "airi_records"),
    }

SCORING_VERSION = "irs-2.0"
CALIBRATION_VERSION = "irs-2.0-cal-2026-09-09"

PILLAR_WEIGHTS = {"vendor_risk": 0.35, "organizational_readiness": 0.35, "integration_risk": 0.30}
VR_WEIGHTS = {
    "base": 0.35,
    "maturity_gap": 0.25,
    "cert_gap": 0.20,
    "track_record": 0.10,
    "financial": 0.10,
}
ORG_WEIGHTS = {
    "ai_gov": 0.25,
    "data_gov": 0.20,
    "skills": 0.25,
    "change_mgmt": 0.15,
    "budget_realism": 0.15,
}
INTR_WEIGHTS = {
    "technical": 0.20,
    "use_case_gap": 0.20,
    "deployment_fit": 0.15,
    "lock_in": 0.15,
    "rollback": 0.10,
    "scaling": 0.20,
}

RTM_MAP = {
    "very_low": 1.25,
    "low": 1.15,
    "moderate": 1.00,
    "high": 0.90,
    "very_high": 0.85,
}

SYSTEM_SCORES = {
    "ehr": 30.0,
    "emr": 30.0,
    "erp": 25.0,
    "financial": 22.0,
    "data warehouse": 18.0,
    "data warehouses": 18.0,
    "hr": 15.0,
    "siem": 15.0,
    "crm": 12.0,
    "ticketing": 10.0,
    "identity": 5.0,
    "sso": 5.0,
}
BUDGET_BANDS = [
    "under $50k",
    "$50k - $100k",
    "$100k - $250k",
    "$250k - $500k",
    "$500k - $1m",
    "$1m - $5m",
    "$5m - $10m",
    "over $10m",
]


def _pf(value: float, digits: int = 4) -> float:
    return float(f"{value:.{digits}f}")


def _round_half_up(x: float) -> int:
    if not math.isfinite(x):
        return 0
    return int(math.floor(float(x) + 0.5))


def _comp(
    name: str,
    weight: float,
    *,
    included: bool,
    value: float | None = None,
    reason: str = "",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "name": name,
        "weight": weight,
        "included": included,
        "value": None if value is None else _pf(_clamp01(value)),
        "reason": reason,
    }
    if extra:
        row.update(extra)
    return row


def _weighted_mean(components: list[dict[str, Any]]) -> dict[str, Any]:
    live = [c for c in components if c.get("included") and c.get("value") is not None]
    total_w = sum(float(c["weight"]) for c in live)
    excluded = [
        {"name": c["name"], "weight": c["weight"], "reason": c.get("reason") or "no_input"}
        for c in components
        if not c.get("included")
    ]
    if total_w <= 0:
        return {
            "earned_weight": 0.0,
            "included": [],
            "excluded": excluded,
            "not_implemented": True,
            "raw": None,
            "value": None,
            "components": components,
        }
    raw = sum(float(c["value"]) * float(c["weight"]) / total_w for c in live)
    return {
        "earned_weight": _pf(total_w),
        "included": [c["name"] for c in live],
        "excluded": excluded,
        "not_implemented": False,
        "raw": _pf(raw),
        "value": _pf(_clamp01(raw)),
        "components": components,
        "redistributed_weights": {
            c["name"]: _pf(float(c["weight"]) / total_w) for c in live
        },
    }


def _redistribute(active: dict[str, bool], base: dict[str, float]) -> dict[str, float]:
    live = {k: v for k, v in base.items() if active.get(k, True)}
    total = sum(live.values())
    if total <= 0:
        return {k: 0.0 for k in base}
    return {k: (live[k] / total if k in live else 0.0) for k in base}


def _headcount_mid(raw: Any) -> float | None:
    s = _norm(raw).replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        pass
    if "50000+" in s or "50,000+" in _norm(raw):
        return 75000.0
    ranges = [
        (50000, 75000.0),
        (10000, 30000.0),
        (5001, 7500.0),
        (5000, 7500.0),
        (1001, 3000.0),
        (501, 750.0),
        (201, 350.0),
        (51, 125.0),
        (1, 25.0),
    ]
    nums = [int(x) for x in re.findall(r"\d+", s)]
    if not nums:
        return None
    hi = max(nums)
    for threshold, mid in ranges:
        if hi >= threshold:
            return mid
    return float(hi)


def _rtm_from_appetite(appetite: Any) -> dict[str, Any]:
    s = _norm(appetite)
    unmatched: list[dict[str, Any]] = []
    key = None
    if not s:
        return {"key": None, "value": 1.0, "unmatched": unmatched, "has_input": False}
    if "very low" in s or "zero tolerance" in s:
        key = "very_low"
    elif "very high" in s or "risk-seeking" in s or "innovation-first" in s:
        key = "very_high"
    elif s.startswith("low") or "prefer proven" in s:
        key = "low"
    elif "conservative" in s:
        key = "very_low"
    elif "aggressive" in s or (s.startswith("high") and "very" not in s):
        key = "high"
    elif "moderate" in s or "balanced" in s:
        key = "moderate"
    if key is None:
        unmatched.append({"field": "riskAppetite", "value": appetite})
        return {"key": None, "value": 1.0, "unmatched": unmatched, "has_input": True}
    return {"key": key, "value": RTM_MAP[key], "unmatched": unmatched, "has_input": True}


def _extract_vts(attestation_row: dict[str, Any] | None) -> tuple[float | None, str]:
    if not isinstance(attestation_row, dict):
        return None, "default_no_assessment"

    report = attestation_row.get("generated_profile_report")
    if not isinstance(report, dict):
        report = {}
    trust_score = report.get("trustScore")
    if not isinstance(trust_score, dict):
        trust_score = report.get("trust_score") if isinstance(report.get("trust_score"), dict) else {}
    if not isinstance(trust_score, dict):
        trust_score = {}
    formula = report.get("formula") if isinstance(report.get("formula"), dict) else {}

    def _finite(raw: Any) -> float | None:
        try:
            n = float(raw)
        except (TypeError, ValueError):
            return None
        if math.isfinite(n):
            return _clamp01(n)
        return None

    for candidate in (
        trust_score.get("overallScore"),
        trust_score.get("overall_score"),
        attestation_row.get("latest_trust_score"),
        attestation_row.get("latestTrustScore"),
        formula.get("vendor_trust_score"),
        formula.get("formula_vendor_trust_score"),
        report.get("vendor_trust_score"),
    ):
        got = _finite(candidate)
        if got is not None:
            return got, "attestation"

    return None, "default_no_assessment"


def _level_1_to_5(raw: Any, table: list[tuple[tuple[str, ...], int]]) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    for tokens, level in table:
        if any(t in s for t in tokens):
            return level
    return None


def _ai_gov_current(raw: Any) -> int | None:
    return _level_1_to_5(
        raw,
        [
            (("none",), 1),
            (("basic",), 2),
            (("intermediate",), 3),
            (("advanced",), 4),
            (("optimized",), 5),
        ],
    )


def _data_gov_current(raw: Any) -> int | None:
    return _level_1_to_5(
        raw,
        [
            (("ad-hoc", "adhoc", "none", "initial", "minimal"), 1),
            (("defined", "developing"), 2),
            (("managed", "mature"), 3),
            (("optimized",), 4),
            (("excellent",), 5),
        ],
    )


def _skills_level(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if s.startswith("none"):
        return 0
    if "limited" in s:
        return 1
    if "moderate" in s:
        return 2
    if "strong" in s:
        return 3
    if "expert" in s:
        return 4
    return None


def _capacity_level(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if "dedicated" in s:
        return 4
    if "named owner" in s or "part-time" in s:
        return 3
    if "shared" in s:
        return 2
    if "no one assigned" in s or "no team" in s:
        return 0
    return None


def _change_cap_level(raw: Any) -> int | None:
    return _level_1_to_5(
        raw,
        [
            (("none",), 1),
            (("ad-hoc", "adhoc", "informal"), 2),
            (("basic",), 3),
            (("intermediate", "structured"), 4),
            (("advanced", "mature"), 5),
            (("excellent",), 6),
        ],
    )


def _band_1_to_5_stakes(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if "life or death" in s or "safety-critical" in s:
        return 5
    if "major financial" in s or "mission critical" in s:
        return 5
    if "high impact" in s:
        return 4
    if "moderate" in s:
        return 3
    if "low impact" in s or "minor" in s:
        return 2
    if "minimal" in s or "non-critical" in s:
        return 1
    return None


def _unavailability_band(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if "work stops" in s:
        return 5
    if "degrades" in s:
        return 3
    if "continues" in s:
        return 2
    if "additive" in s:
        return 1
    return None


def _penalty_exposure_band(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if "severe" in s or "100m+" in s:
        return 5
    if s.startswith("high") or "$10m" in s:
        return 4
    if "medium" in s:
        return 3
    if s.startswith("low"):
        return 2
    if "minimal" in s:
        return 1
    return None


def _sensitivity_required(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if "extremely" in s or "national security" in s:
        return 5
    if "highly sensitive" in s or "phi" in s or "pci" in s:
        return 4
    if "sensitive" in s or "pii" in s:
        return 3
    if "internal" in s:
        return 2
    if "public" in s:
        return 1
    return None


def _users_band_points(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if "5,000+" in s or "5000+" in s:
        return 36
    if "1,001" in s or "1001" in s:
        return 28
    if "251" in s:
        return 20
    if "51-250" in s or "51 – 250" in s:
        return 14
    if "11-50" in s:
        return 8
    if "1-10" in s:
        return 4
    return None


def _users_scale_factor(raw: Any) -> float:
    s = _norm(raw)
    if "5,000+" in s or "5000+" in s:
        return 2.0
    if "1,001" in s or "1001" in s:
        return 1.6
    if "251" in s:
        return 1.25
    if "51" in s:
        return 1.0
    if "11-50" in s:
        return 0.75
    return 0.5


def _scaling_user_penalty(raw: Any) -> float:
    s = _norm(raw)
    if "5,000+" in s or "5000+" in s:
        return 25.0
    if "1,001" in s or "1001" in s:
        return 20.0
    if "251" in s:
        return 15.0
    if "51" in s:
        return 10.0
    if "11-50" in s:
        return 5.0
    return 0.0


def _budget_index(raw: Any) -> int | None:
    s = _norm(raw).replace("–", "-")
    if not s:
        return None
    if "not known" in s or "estimate only" in s:
        return -1
    for i, band in enumerate(BUDGET_BANDS):
        if band in s:
            return i
    return None


def _vendor_stage_rank(raw: Any) -> int | None:
    s = _norm(raw)
    if not s:
        return None
    if "startup" in s or "pre-seed" in s or "early" in s:
        return 1
    if "growth" in s or "bootstrap" in s:
        return 2
    if "established" in s:
        return 3
    if "enterprise" in s or "publicly" in s or "mature" in s:
        return 4
    return None


def _buyer_size_rank(employees: float | None) -> int | None:
    if employees is None:
        return None
    if employees >= 10000:
        return 4
    if employees >= 1000:
        return 3
    if employees >= 200:
        return 2
    return 1


def _integration_systems(resolved: dict[str, Any]) -> list[str]:
    systems = _parse_list(resolved.get("integrationSystems"))
    return [s for s in systems if "no integration" not in _norm(s) and _norm(s) != "none"]


def _system_score(name: str) -> float:
    s = _norm(name)
    for token, pts in SYSTEM_SCORES.items():
        if token in s:
            return pts
    return 15.0


def _access_multiplier(level: Any) -> float:
    s = _norm(level)
    if "admin" in s:
        return 1.5
    if "delete" in s:
        return 1.4
    if "write" in s:
        return 1.2
    return 1.0


def _blob(items: list[str]) -> str:
    return " ".join(_norm(x) for x in items)


def _cert_held(haystack: str, needles: tuple[str, ...]) -> bool:
    return any(n in haystack for n in needles)


def _calc_base_vendor_risk(
    resolved: dict[str, Any],
    attestation_row: dict[str, Any] | None,
) -> dict[str, Any]:
    vts, source = _extract_vts(attestation_row)
    rtm = _rtm_from_appetite(resolved.get("riskAppetite"))
    defaulted = vts is None
    base_vts = 50.0 if defaulted else float(vts)
    raw = (100.0 - base_vts) * float(rtm["value"])
    note = "no vendor assessment is available" if defaulted else ""
    return _comp(
        "base",
        VR_WEIGHTS["base"],
        included=True,
        value=_clamp01(raw),
        reason=note,
        extra={
            "vendor_trust_score": _pf(base_vts),
            "vts_source": source,
            "rtm": rtm,
            "raw": _pf(raw),
            "default_disclosed": defaulted,
        },
    )


def _calc_maturity_gap(resolved: dict[str, Any]) -> dict[str, Any]:
    vendor_stage = _vendor_stage_rank(resolved.get("vendorMaturity"))
    buyer_n = _headcount_mid(resolved.get("buyerEmployeeCount"))
    vendor_n = _headcount_mid(resolved.get("vendorEmployeeCount"))
    buyer_rank = _buyer_size_rank(buyer_n)
    has_any = any(x is not None for x in (vendor_stage, buyer_n, vendor_n, resolved.get("industrySector")))
    if not has_any:
        return _comp("maturity_gap", VR_WEIGHTS["maturity_gap"], included=False, reason="no_input")

    stage_pen = 0.0
    if vendor_stage is not None and buyer_rank is not None:
        stage_pen = float(max(0, buyer_rank - vendor_stage) * 8)

    scale_pen = 0.0
    if buyer_n and vendor_n and vendor_n > 0:
        ratio = buyer_n / vendor_n
        if ratio > 10:
            scale_pen = min(20.0, ratio * 2.0)

    industry_pen = 0.0
    buyer_ind = _norm(resolved.get("industrySector"))
    vendor_inds = _blob(_parse_list(resolved.get("vendorTargetIndustries")))
    if buyer_ind:
        if vendor_inds and buyer_ind not in vendor_inds:
            industry_pen = 10.0
        elif not vendor_inds:
            industry_pen = 10.0

    return _comp(
        "maturity_gap",
        VR_WEIGHTS["maturity_gap"],
        included=True,
        value=stage_pen + scale_pen + industry_pen,
        extra={
            "stage_penalty": stage_pen,
            "scale_penalty": _pf(scale_pen),
            "industry_penalty": industry_pen,
        },
    )


def _calc_cert_gap(resolved: dict[str, Any]) -> dict[str, Any]:
    regs = [_norm(x) for x in _parse_list(resolved.get("regulatoryRequirements"))]
    regs = [r for r in regs if r and "not applicable" not in r and r != "none"]
    if not regs and _is_empty(resolved.get("regulatoryRequirements")):
        return _comp("cert_gap", VR_WEIGHTS["cert_gap"], included=False, reason="no_input")

    vendor_blob = _blob(_parse_list(resolved.get("vendorCertifications")))
    evidence_blob = _blob(_parse_list(resolved.get("vendorEvidenceReceived")))
    claimed_blob = vendor_blob + " " + _blob(_parse_list(resolved.get("vendorClaimedCerts")))

    def credit(needles: tuple[str, ...], weight: float) -> float:
        held_vendor = _cert_held(claimed_blob, needles)
        held_buyer = _cert_held(evidence_blob, needles)
        if held_buyer or (held_vendor and held_buyer):
            return 0.0
        if held_vendor and not held_buyer:
            return weight * 0.5
        return weight

    gap = 0.0
    parts: list[dict[str, Any]] = []
    if any("hipaa" in r for r in regs):
        w = credit(("hipaa baa", "baa"), 10.0) + credit(("soc 2", "soc2"), 10.0)
        gap += w
        parts.append({"req": "HIPAA", "gap": w})
    if any("pci" in r for r in regs):
        w = credit(("pci dss", "pci"), 15.0)
        gap += w
        parts.append({"req": "PCI DSS", "gap": w})
    if any("fedramp" in r for r in regs):
        w = credit(("fedramp",), 20.0)
        gap += w
        parts.append({"req": "FedRAMP", "gap": w})
    if any("gdpr" in r or "uk gdpr" in r for r in regs):
        iso = credit(("iso 27001", "iso27001"), 12.0)
        dpa = credit(("dpa",), 12.0)
        w = min(iso, dpa)
        gap += w
        parts.append({"req": "GDPR/UK", "gap": w})
    if any("eu ai act" in r for r in regs):
        w = credit(("iso 42001", "iso42001"), 6.0)
        gap += w
        parts.append({"req": "EU AI Act", "gap": w})

    return _comp(
        "cert_gap",
        VR_WEIGHTS["cert_gap"],
        included=True,
        value=gap,
        extra={"parts": parts, "requirements": regs},
    )


def _calc_track_record(resolved: dict[str, Any]) -> dict[str, Any]:
    # Document 0 §7 is not implemented. With no supplied records this leaf
    # scores 0 and states "no public record found" (Document 3 T3-10).
    records = resolved.get("airiRecords")
    if _is_empty(records):
        return _comp(
            "track_record",
            VR_WEIGHTS["track_record"],
            included=True,
            value=0.0,
            reason="no public record found",
            extra={"note": "no public record found"},
        )
    total = 0.0
    sev = {"critical": 25.0, "high": 12.0, "medium": 5.0, "low": 2.0}
    for rec in records if isinstance(records, list) else []:
        if not isinstance(rec, dict):
            continue
        pts = sev.get(_norm(rec.get("severity")), 0.0)
        if _bool_yes(rec.get("disclosed")) and _bool_yes(rec.get("resolved")):
            pts *= 0.5
        total += pts
    return _comp(
        "track_record",
        VR_WEIGHTS["track_record"],
        included=True,
        value=min(100.0, total),
        extra={"raw": total},
    )


def _calc_financial(resolved: dict[str, Any]) -> dict[str, Any]:
    pos = _norm(resolved.get("financialPosition"))
    if not pos:
        return _comp("financial", VR_WEIGHTS["financial"], included=False, reason="no_input")
    base_map = {
        "profitable_3_years": 5.0,
        "profitable_1_year": 12.0,
        "break_even": 22.0,
        "funded_runway_2_years": 18.0,
        "funded_runway_1_year": 28.0,
        "uncertain": 40.0,
    }
    base = None
    for key, pts in base_map.items():
        if key.replace("_", " ") in pos.replace("-", " ") or key in pos:
            base = pts
            break
    if "profitable" in pos and "3" in pos:
        base = 5.0
    elif "profitable" in pos:
        base = 12.0
    elif "break" in pos:
        base = 22.0
    elif "uncertain" in pos:
        base = 40.0
    elif "2+" in pos or "2 years" in pos:
        base = 18.0
    elif "1+" in pos or "1 year" in pos:
        base = 28.0
    if base is None:
        return _comp(
            "financial",
            VR_WEIGHTS["financial"],
            included=False,
            reason="unmatched",
            extra={"unmatched": [{"field": "financialPosition", "value": resolved.get("financialPosition")}]},
        )
    bonus = 0.0
    try:
        retention = float(resolved.get("retentionRate") or 0)
    except (TypeError, ValueError):
        retention = 0.0
    if retention > 90:
        bonus -= 4.0
    try:
        ent = float(resolved.get("enterpriseCustomers") or 0)
    except (TypeError, ValueError):
        ent = 0.0
    if ent > 20:
        bonus -= 3.0
    funding = _norm(resolved.get("fundingStatus"))
    if "public" in funding or "publicly" in pos:
        bonus -= 3.0
    return _comp(
        "financial",
        VR_WEIGHTS["financial"],
        included=True,
        value=max(0.0, base + bonus),
        extra={"base": base, "bonuses": bonus},
    )


def _dispute_adjustment(resolved: dict[str, Any]) -> dict[str, Any]:
    stances = [
        resolved.get("trainingUseOfDataStance"),
        resolved.get("monitoringDataStance"),
        resolved.get("auditLogsStance"),
        resolved.get("dataExportStance"),
    ]
    n = sum(1 for s in stances if _norm(s) == "dispute")
    value = min(20.0, 5.0 * n)
    return {"disputed_count": n, "value": value}


def _calc_ai_gov(resolved: dict[str, Any]) -> dict[str, Any]:
    current = _ai_gov_current(resolved.get("aiGovernanceMaturity"))
    if current is None:
        return _comp("ai_gov", ORG_WEIGHTS["ai_gov"], included=False, reason="no_input")
    rtm = _rtm_from_appetite(resolved.get("riskAppetite"))
    appetite_req = {"very_low": 5, "low": 4, "moderate": 3, "high": 2, "very_high": 2}.get(
        rtm.get("key") or "", 3
    )
    crit = [
        b
        for b in (
            _band_1_to_5_stakes(resolved.get("decisionStakes")),
            _unavailability_band(resolved.get("unavailabilityImpact")),
            _penalty_exposure_band(resolved.get("regulatoryPenaltyExposure")),
        )
        if b is not None
    ]
    criticality = max(crit) if crit else 1
    required = max(appetite_req, criticality)
    gap = max(0, required - current) * 15
    penalties = 0.0
    review = _norm(resolved.get("humanReviewLevel"))
    domains = [
        d
        for d in _parse_list(resolved.get("decisionDomains"))
        if "none of these" not in _norm(d)
    ]
    if review.startswith("no review") and domains:
        penalties += 10.0
    disclosure = _norm(resolved.get("aiDisclosure"))
    exposure = _norm(resolved.get("outputExposure"))
    if "customer-facing" in exposure and ("not disclosed" in disclosure or "not yet" in disclosure):
        penalties += 5.0
    owner_role = _norm(resolved.get("accountableOwnerRole"))
    if owner_role in ("", "other") and _is_empty(resolved.get("accountableOwnerName")):
        penalties += 5.0
    elif owner_role == "other":
        penalties += 5.0
    return _comp(
        "ai_gov",
        ORG_WEIGHTS["ai_gov"],
        included=True,
        value=gap + penalties,
        extra={"current": current, "required": required, "penalties": penalties},
    )


def _calc_data_gov(resolved: dict[str, Any]) -> dict[str, Any]:
    current = _data_gov_current(resolved.get("dataGovernanceMaturity"))
    required = _sensitivity_required(resolved.get("dataSensitivity"))
    if current is None and required is None:
        return _comp("data_gov", ORG_WEIGHTS["data_gov"], included=False, reason="no_input")
    if current is None:
        current = 1
    if required is None:
        required = 1
    gap = max(0, required - current) * 15
    penalties = 0.0
    training = _norm(resolved.get("trainingUseOfData"))
    stance = _norm(resolved.get("trainingUseOfDataStance"))
    if required >= 3 and (stance == "dispute" or training.startswith("yes") or "not yet" in training):
        penalties += 10.0
    retention = _norm(resolved.get("retentionRequirement"))
    regs = _parse_list(resolved.get("regulatoryRequirements"))
    regulated = any("none" not in _norm(r) and "not applicable" not in _norm(r) for r in regs)
    if "not yet determined" in retention and regulated:
        penalties += 5.0
    juris = [
        j
        for j in _parse_list(resolved.get("dataSubjectJurisdictions"))
        if "no personal" not in _norm(j)
    ]
    if len(juris) >= 3:
        penalties += 5.0
    return _comp(
        "data_gov",
        ORG_WEIGHTS["data_gov"],
        included=True,
        value=gap + penalties,
        extra={"current": current, "required": required, "penalties": penalties},
    )


def _calc_skills(resolved: dict[str, Any]) -> dict[str, Any]:
    skills = _skills_level(resolved.get("aiSkillsAvailability"))
    cap = _capacity_level(resolved.get("implementationCapacity"))
    systems = _integration_systems(resolved)
    users = _norm(resolved.get("usersInScope"))
    custom = _norm(resolved.get("vendorCustomization"))
    required = 1
    if (
        "heavy" in custom
        or "significant" in custom
        or len(systems) >= 5
        or "5,000+" in users
        or "5000+" in users
    ):
        required = 4
    elif "light" in custom or len(systems) in (3, 4) or "1,001" in users or "1001" in users:
        required = 3
    elif "configuration" in custom or len(systems) in (1, 2):
        required = 2
    if skills is None and cap is None and not systems and not users and not custom:
        return _comp("skills", ORG_WEIGHTS["skills"], included=False, reason="no_input")
    current_parts = [x for x in (skills, cap) if x is not None]
    current = min(current_parts) if current_parts else 0
    gap = max(0, required - current) * 15
    effort = _norm(resolved.get("trainingEffort"))
    train_pen = 0.0
    if "multi-day" in effort:
        train_pen = 8.0
    elif "1-4" in effort or "1 – 4" in effort:
        train_pen = 4.0
    return _comp(
        "skills",
        ORG_WEIGHTS["skills"],
        included=True,
        value=gap + train_pen,
        extra={"required": required, "current": current, "training_penalty": train_pen},
    )


def _calc_change_mgmt(resolved: dict[str, Any]) -> dict[str, Any]:
    capability = _change_cap_level(resolved.get("changeManagementCapability"))
    users_pts = _users_band_points(resolved.get("usersInScope"))
    if capability is None and users_pts is None and _is_empty(resolved.get("outputExposure")):
        return _comp("change_mgmt", ORG_WEIGHTS["change_mgmt"], included=False, reason="no_input")
    capability = capability or 1
    users_pts = users_pts or 0
    exposure = _norm(resolved.get("outputExposure"))
    if "published directly" in exposure:
        exp = 15
    elif "customer-facing with" in exposure or ("customer-facing" in exposure and "review" in exposure):
        exp = 8
    elif "quoted" in exposure:
        exp = 3
    else:
        exp = 0
    use_n = len(_parse_list(resolved.get("useCaseTypes")))
    impact = users_pts + exp + 3 * use_n
    raw = min(60.0, impact * 100.0 / (capability * 10 + 20))
    bonus = 0.0
    pilot = _norm(resolved.get("pilotStatus"))
    if "met criteria" in pilot and "did not" not in pilot:
        bonus -= 8.0
    if "executive sponsor" in _norm(resolved.get("accountableOwnerRole")):
        bonus -= 5.0
    if "officially in use" in _norm(resolved.get("currentUsageState")):
        bonus -= 5.0
    return _comp(
        "change_mgmt",
        ORG_WEIGHTS["change_mgmt"],
        included=True,
        value=max(0.0, raw + bonus),
        extra={"impact": impact, "capability": capability, "bonuses": bonus, "raw": _pf(raw)},
    )


def _deployment_factor(model: Any) -> float:
    s = _norm(model)
    if "vendor-hosted" in s or "saas is acceptable" in s:
        return 1.00
    if "single-tenant" in s:
        return 1.15
    if "private cloud" in s or "vpc" in s:
        return 1.35
    if "on-premise" in s:
        return 1.75
    if "not yet" in s:
        return 1.35
    return 1.35


def _integration_factor(systems: list[str]) -> float:
    n = len(systems)
    if n == 0:
        return 1.00
    if n <= 2:
        return 1.25
    if n <= 5:
        return 1.55
    return 1.85


def _calc_budget(resolved: dict[str, Any]) -> dict[str, Any]:
    vendor_band = _budget_index(resolved.get("vendorContractValueBand"))
    if vendor_band is None:
        return _comp("budget_realism", ORG_WEIGHTS["budget_realism"], included=False, reason="no_input")
    stated = _budget_index(resolved.get("budgetRange"))
    systems = _integration_systems(resolved)
    dep = _deployment_factor(resolved.get("deploymentModel"))
    integ = _integration_factor(systems)
    multiplier = max(1.40, min(3.50, dep * integ))
    scale = _users_scale_factor(resolved.get("usersInScope"))
    expected_idx = min(7, max(0, int(round(vendor_band * scale * multiplier / 1.0))))
    extra = 0.0
    if stated == -1:
        extra = 15.0
        stated_idx = expected_idx
    elif stated is None:
        extra = 15.0
        stated_idx = expected_idx
    else:
        stated_idx = stated
    value = min(45.0, 12.0 * max(0, expected_idx - stated_idx) + extra)
    return _comp(
        "budget_realism",
        ORG_WEIGHTS["budget_realism"],
        included=True,
        value=value,
        extra={
            "estimated": True,
            "deployment_factor": dep,
            "integration_factor": integ,
            "internal_cost_multiplier": _pf(multiplier),
            "expected_band_index": expected_idx,
            "stated_band_index": stated_idx,
        },
    )


def _calc_technical(resolved: dict[str, Any]) -> dict[str, Any]:
    systems = _integration_systems(resolved)
    raw_list = _parse_list(resolved.get("integrationSystems"))
    if not raw_list:
        return _comp("technical", INTR_WEIGHTS["technical"], included=False, reason="no_input")
    access_map = resolved.get("integrationAccessLevels")
    scores: list[float] = []
    for sys in systems:
        level = None
        if isinstance(access_map, dict):
            level = access_map.get(sys) or access_map.get(_norm(sys))
        scores.append(_system_score(sys) * _access_multiplier(level))
    avg = sum(scores) / len(scores) if scores else 0.0
    count_pen = max(0, len(systems) - 5) * 6.0
    return _comp(
        "technical",
        INTR_WEIGHTS["technical"],
        included=True,
        value=avg + count_pen,
        extra={
            "systems": systems,
            "average": _pf(avg),
            "count_penalty": count_pen,
            "count": len(systems),
        },
    )


_USE_CASE_CAPS = {
    "take an action automatically": ("autonomous", "agent", "workflow", "automation"),
    "recommend an action": ("recommend", "decision support", "copilot"),
    "draft or generate content": ("generat", "llm", "content", "gpt"),
    "summarise": ("summar", "nlp"),
    "answer questions": ("rag", "knowledge", "qa", "search"),
    "write or review code": ("code", "developer", "ide"),
    "classify or route": ("classif", "routing"),
    "extract data": ("extract", "ocr", "document"),
    "translate": ("translat",),
    "transcribe": ("transcrib", "speech"),
}


def _calc_use_case_gap(resolved: dict[str, Any]) -> dict[str, Any]:
    cases = _parse_list(resolved.get("useCaseTypes"))
    if not cases:
        return _comp("use_case_gap", INTR_WEIGHTS["use_case_gap"], included=False, reason="no_input")
    caps_blob = _blob(_parse_list(resolved.get("vendorAiCapabilities")))
    required = 0
    covered = 0
    for case in cases:
        key = next((k for k in _USE_CASE_CAPS if k in _norm(case)), None)
        required += 1
        needles = _USE_CASE_CAPS.get(key or "", ())
        if needles and any(n in caps_blob for n in needles):
            covered += 1
        elif not needles and caps_blob:
            covered += 1
    gap = 50.0 * (1.0 - (covered / required if required else 1.0))
    autonomy = _norm(resolved.get("vendorDecisionAutonomy"))
    auto_use = any("automatically" in _norm(c) for c in cases)
    extra_pen = 0.0
    if auto_use and ("advisor" in autonomy or "advisory" in autonomy or "assisted" in autonomy):
        extra_pen = 15.0
    return _comp(
        "use_case_gap",
        INTR_WEIGHTS["use_case_gap"],
        included=True,
        value=gap + extra_pen,
        extra={"required": required, "covered": covered, "autonomy_penalty": extra_pen},
    )


def _buyer_data_subject_jurisdictions(resolved: dict[str, Any]) -> list[str]:
    return [
        j
        for j in _parse_list(resolved.get("dataSubjectJurisdictions"))
        if "no personal" not in _norm(j) and _norm(j) != "other"
    ]


def _residency_impossible(resolved: dict[str, Any]) -> bool:
    """Document 3 §8 — jurisdiction with no matching vendor residency option.

    Does not use AIRI (Document 0 §7). Compares buyer jurisdictions to attested options.
    """
    buyer_j = _buyer_data_subject_jurisdictions(resolved)
    if not buyer_j:
        return False
    vendor_res = _blob(_parse_list(resolved.get("vendorResidencyOptions")))
    if vendor_res:
        for j in buyer_j:
            token = _norm(j).replace("eu/eea", "eu")
            if token not in vendor_res and token[:2] not in vendor_res:
                return True
        return False
    return bool(resolved.get("vendorHosting"))


def _vendor_hosting_flags(resolved: dict[str, Any]) -> dict[str, bool]:
    blob = _blob(_parse_list(resolved.get("vendorHosting"))) + " " + _norm(resolved.get("vendorHosting"))
    isolation = _norm(resolved.get("tenantIsolationModel"))
    return {
        "on_premise": "on-premise" in blob or "on premise" in blob or "hybrid" in blob,
        "hybrid": "hybrid" in blob,
        "saas_only": ("saas" in blob or "cloud" in blob) and "on-premise" not in blob and "hybrid" not in blob,
        "single_tenant": "single-tenant" in blob or "single tenant" in isolation,
        "row_level": "row-level" in isolation or "row level" in isolation,
        "cloud_only": ("cloud" in blob or "saas" in blob) and "on-premise" not in blob,
    }


def _calc_deployment_fit(resolved: dict[str, Any]) -> dict[str, Any]:
    model = _norm(resolved.get("deploymentModel"))
    if not model and _is_empty(resolved.get("dataSubjectJurisdictions")):
        return _comp("deployment_fit", INTR_WEIGHTS["deployment_fit"], included=False, reason="no_input")
    flags = _vendor_hosting_flags(resolved)
    value = 0.0
    if "on-premise required" in model and not flags["on_premise"] and not flags["hybrid"]:
        value += 30.0
    if (
        ("single-tenant" in model or "private cloud" in model)
        and (flags["saas_only"] or flags["row_level"])
    ):
        value += 20.0
    if _residency_impossible(resolved):
        value += 15.0
    cloud = _norm(resolved.get("cloudProvider") or resolved.get("existingTechnologyStack"))
    if "on-premise" in cloud and flags["cloud_only"]:
        value += 5.0
    return _comp(
        "deployment_fit",
        INTR_WEIGHTS["deployment_fit"],
        included=True,
        value=min(60.0, value),
        extra={"vendor_flags": flags},
    )


def _calc_lock_in(resolved: dict[str, Any]) -> dict[str, Any]:
    export = _norm(resolved.get("dataExportCapability"))
    contracts = [_norm(x) for x in _parse_list(resolved.get("contractsInPlace"))]
    notice = _norm(resolved.get("contractNoticePeriod"))
    if not export and not contracts and not notice:
        return _comp("lock_in", INTR_WEIGHTS["lock_in"], included=False, reason="no_input")
    value = 0.0
    if export.startswith("yes") and "limited" in export:
        value += 10.0
    elif export.startswith("no"):
        value += 25.0
    elif "not yet" in export:
        value += 15.0
    if _norm(resolved.get("dataExportStance")) == "dispute":
        value += 5.0
    flags = _vendor_hosting_flags(resolved)
    if flags["saas_only"]:
        value += 12.0
    models = _blob(_parse_list(resolved.get("vendorModelTypes")))
    if "custom-trained" in models or "fully custom" in models:
        value += 8.0
    if "multi-year" in notice:
        value += 10.0
    elif "annual" in notice:
        value += 5.0
    elif "not yet negotiated" in notice:
        value += 5.0
    if any("nothing signed" in c for c in contracts):
        value += 7.0
    return _comp("lock_in", INTR_WEIGHTS["lock_in"], included=True, value=value)


def _calc_rollback(resolved: dict[str, Any]) -> dict[str, Any]:
    mech = resolved.get("rollbackCapability")
    if _is_empty(mech):
        return _comp("rollback", INTR_WEIGHTS["rollback"], included=False, reason="no_input")
    s = _norm(mech)
    if "instant" in s or "automated rollback" in s:
        mechanism = 2.0
    elif "rapid" in s or "manual trigger" in s:
        mechanism = 8.0
    elif "manual" in s and "documented" in s:
        mechanism = 15.0
    elif "limited" in s or "moderate" in s or "manual" in s:
        mechanism = 22.0
    elif s.startswith("none") or "no rollback" in s:
        mechanism = 30.0
    else:
        mechanism = 15.0
    una = _norm(resolved.get("unavailabilityImpact"))
    if "work stops" in una:
        continuity = 20.0
    elif "degrades" in una:
        continuity = 10.0
    else:
        continuity = 0.0
    testing = 8.0 if "not planned" in _norm(resolved.get("pilotStatus")) or _is_empty(
        resolved.get("pilotStatus")
    ) else 0.0
    if "met criteria" in _norm(resolved.get("pilotStatus")):
        testing = 0.0
    return _comp(
        "rollback",
        INTR_WEIGHTS["rollback"],
        included=True,
        value=mechanism + continuity + testing,
        extra={"mechanism": mechanism, "continuity": continuity, "testing_gap": testing},
    )


def _vendor_scale_band(raw: Any) -> int:
    s = _norm(raw)
    if "5000" in s or "5,000" in s or "enterprise" in s:
        return 6
    if "1000" in s or "1,000" in s:
        return 5
    if "250" in s:
        return 4
    if "50" in s:
        return 3
    if "10" in s:
        return 2
    return 0


def _buyer_scale_band(raw: Any) -> int:
    s = _norm(raw)
    if "5,000+" in s or "5000+" in s:
        return 6
    if "1,001" in s:
        return 5
    if "251" in s:
        return 4
    if "51" in s:
        return 3
    if "11-50" in s:
        return 2
    if "1-10" in s:
        return 1
    return 0


def _calc_scaling(resolved: dict[str, Any]) -> dict[str, Any]:
    users = resolved.get("usersInScope")
    pilot = _norm(resolved.get("pilotStatus"))
    if _is_empty(users) and not pilot:
        return _comp("scaling", INTR_WEIGHTS["scaling"], included=False, reason="no_input")
    pen = _scaling_user_penalty(users)
    if "met criteria" in pilot and "did not" not in pilot:
        pen *= 0.5
    if "not planned" in pilot:
        pen += 10.0
    if _buyer_scale_band(users) > _vendor_scale_band(resolved.get("vendorDeploymentScale")) > 0:
        pen += 15.0
    return _comp("scaling", INTR_WEIGHTS["scaling"], included=True, value=pen)


def _blocker_gates(resolved: dict[str, Any], vr_parts: dict[str, Any]) -> list[dict[str, str]]:
    gates: list[dict[str, str]] = []
    model = _norm(resolved.get("deploymentModel"))
    flags = _vendor_hosting_flags(resolved)
    if ("on-premise required" in model or "single-tenant" in model) and not flags["on_premise"] and not flags["single_tenant"] and not flags["hybrid"]:
        if "on-premise required" in model and not flags["on_premise"] and not flags["hybrid"]:
            gates.append({
                "id": "deployment_model_impossible",
                "condition": "On-premise or single-tenant is required and the vendor offers neither",
                "recommendation": "Flagged as a high risk",
            })
        elif "single-tenant" in model and not flags["single_tenant"]:
            gates.append({
                "id": "deployment_model_impossible",
                "condition": "On-premise or single-tenant is required and the vendor offers neither",
                "recommendation": "Flagged as a high risk",
            })
    if _residency_impossible(resolved):
        gates.append({
            "id": "data_residency_impossible",
            "condition": "A data-subject jurisdiction has no matching vendor residency option",
            "recommendation": "Flagged as a high risk",
        })
    cert = next((c for c in vr_parts.get("components") or [] if c.get("name") == "cert_gap"), None)
    if cert and cert.get("included") and float(cert.get("value") or 0) > 0:
        parts = cert.get("parts") or []
        if any(float(p.get("gap") or 0) > 0 and p.get("req") != "EU AI Act" for p in parts):
            gates.append({
                "id": "mandatory_certification_absent",
                "condition": "A certification required by the derived regulatory set is not held",
                "recommendation": "Flagged as a high risk",
            })
    domains = [d for d in _parse_list(resolved.get("decisionDomains")) if "none of these" not in _norm(d)]
    if domains and _is_empty(resolved.get("accountableOwnerName")):
        gates.append({
            "id": "no_accountable_owner",
            "condition": "No named owner, and the AI influences decisions about individuals",
            "recommendation": "Flagged as a high risk",
        })
    rb = _norm(resolved.get("rollbackCapability"))
    if (rb.startswith("none") or "no rollback" in rb) and "work stops" in _norm(resolved.get("unavailabilityImpact")):
        gates.append({
            "id": "no_rollback_and_work_stops",
            "condition": "The vendor has no rollback capability and the buyer states work stops without the system",
            "recommendation": "Flagged as a high risk",
        })
    return gates


def _interpret(score: float, blockers: list[dict[str, str]]) -> dict[str, str]:
    s = max(0, min(100, round(float(score))))
    if s >= 76:
        out = {
            "grade": "A",
            "classification": "High Readiness",
            "decision": "PROCEED",
            "readiness_profile": "Organization ready; vendor capable; integration straightforward ",
            "recommendedAction": "Proceed with standard implementation timeline.",
        }
    elif s >= 51:
        out = {
            "grade": "B",
            "classification": "Moderate Readiness",
            "decision": "PROCEED WITH CAUTION",
            "readiness_profile": "Some gaps exist; manageable with planning",
            "recommendedAction": "Proceed with gap mitigation plan; extend timeline 20-30%.",
        }
    elif s >= 26:
        out = {
            "grade": "C",
            "classification": "Low Readiness",
            "decision": "PROCEED WITH CAUTION",
            "readiness_profile": "Significant gaps; risk of failure if not addressed.",
            "recommendedAction": "Proceed with caution; extend timeline 50-100%; pilot first.",
        }
    else:
        out = {
            "grade": "D",
            "classification": "Readiness Review Required",
            "decision": "DO NOT PROCEED",
            "readiness_profile": "Major gaps across dimensions; additional preparation needed",
            "recommendedAction": "Do not proceed until critical gaps are resolved; reassess after remediation.",
        }
    if blockers:
        out["decision"] = "Flagged as a high risk"
        out["recommendedAction"] = "Flagged as a high risk — " + "; ".join(
            b["condition"] for b in blockers
        )
        out["blocker_override"] = "true"
    return out


def calculate_buyer_implementation_risk_score(
    buyer_payload: dict[str, Any],
    attestation_row: dict[str, Any] | None,
    vendor_name: str,
    product_name: str,
) -> dict[str, Any]:
    payload = buyer_payload if isinstance(buyer_payload, dict) else {}
    resolved = resolve_buyer_irs_inputs(payload, attestation_row)

    vr_components = [
        _calc_base_vendor_risk(resolved, attestation_row),
        _calc_maturity_gap(resolved),
        _calc_cert_gap(resolved),
        _calc_track_record(resolved),
        _calc_financial(resolved),
    ]
    org_components = [
        _calc_ai_gov(resolved),
        _calc_data_gov(resolved),
        _calc_skills(resolved),
        _calc_change_mgmt(resolved),
        _calc_budget(resolved),
    ]
    int_components = [
        _calc_technical(resolved),
        _calc_use_case_gap(resolved),
        _calc_deployment_fit(resolved),
        _calc_lock_in(resolved),
        _calc_rollback(resolved),
        _calc_scaling(resolved),
    ]
    vr_parts = _weighted_mean(vr_components)
    dispute = _dispute_adjustment(resolved)
    if vr_parts["value"] is not None:
        vr_value = _clamp01(float(vr_parts["value"]) + float(dispute["value"]))
    else:
        vr_value = None
        if dispute["value"]:
            vr_value = _clamp01(float(dispute["value"]))
            vr_parts["not_implemented"] = False
    org_parts = _weighted_mean(org_components)
    int_parts = _weighted_mean(int_components)

    active = {
        "vendor_risk": vr_value is not None,
        "organizational_readiness": org_parts["value"] is not None,
        "integration_risk": int_parts["value"] is not None,
    }
    weights = _redistribute(active, PILLAR_WEIGHTS)
    risk_term = 0.0
    vr = float(vr_value) if vr_value is not None else 0.0
    org = float(org_parts["value"]) if org_parts["value"] is not None else 0.0
    integ = float(int_parts["value"]) if int_parts["value"] is not None else 0.0
    risk_term = vr * weights["vendor_risk"] + org * weights["organizational_readiness"] + integ * weights["integration_risk"]
    weighted = 100.0 - risk_term
    score = _round_half_up(_clamp01(weighted))

    blockers = _blocker_gates(resolved, vr_parts)
    interpreted = _interpret(score, blockers)
    vts, vts_source = _extract_vts(attestation_row)
    vendor_trust_score = 50.0 if vts is None else vts

    return {
        "implementationRiskScore": score,
        "grade": interpreted["grade"],
        "classification": interpreted["classification"],
        "decision": interpreted["decision"],
        "readiness_profile": interpreted["readiness_profile"],
        "recommendedAction": interpreted["recommendedAction"],
        "scoring_version": SCORING_VERSION,
        "calibration_version": CALIBRATION_VERSION,
        "formula": "IRS = 100 - (VR x 0.35 + ORG x 0.35 + IntR x 0.30)  [Doc 3; missing pillars redistributed per Doc 0 §6]",
        "breakdown": {
            "vendorRisk": _pf(vr) if active["vendor_risk"] else None,
            "organizationalReadinessGap": _pf(org) if active["organizational_readiness"] else None,
            "integrationRisk": _pf(integ) if active["integration_risk"] else None,
            "vendorTrustScore": _pf(vendor_trust_score),
            "disputeAdjustment": dispute["value"],
            "pillarWeightsUsed": weights,
        },
        "detail": {
            "vendor_risk": {**vr_parts, "value": None if vr_value is None else _pf(vr), "dispute": dispute},
            "organizational_readiness_gap": org_parts,
            "integration_risk": int_parts,
            "blockers": blockers,
            "final_formula": {
                "vendor_risk": vr if active["vendor_risk"] else None,
                "organizational_readiness_gap": org if active["organizational_readiness"] else None,
                "integration_risk": integ if active["integration_risk"] else None,
                "weights": weights,
                "risk_term": _pf(risk_term),
                "weighted": _pf(weighted),
                "score": score,
            },
            "resolved_inputs": resolved,
            "vts_source": vts_source,
        },
        "source": {
            "vendorName": vendor_name or "Vendor",
            "productName": product_name or "Product",
            "usedAttestation": attestation_row is not None and vts_source == "attestation",
            "blockers": blockers,
            "resolvedInputs": {
                "aiGovernanceMaturity": resolved.get("aiGovernanceMaturity"),
                "dataGovernanceMaturity": resolved.get("dataGovernanceMaturity"),
                "implementationCapacity": resolved.get("implementationCapacity"),
                "currentUsageState": resolved.get("currentUsageState"),
                "rollbackCapability": resolved.get("rollbackCapability"),
                "humanReviewLevel": resolved.get("humanReviewLevel"),
            },
        },
    }


def buyer_implementation_readiness_grade_from_score(raw_score: float) -> str:
    """Letter grade for a stored IRS (0-100)."""
    return _interpret(raw_score, [])["grade"]


__all__ = [
    "calculate_buyer_implementation_risk_score",
    "buyer_implementation_readiness_grade_from_score",
    "resolve_buyer_irs_inputs",
    "SCORING_VERSION",
]
