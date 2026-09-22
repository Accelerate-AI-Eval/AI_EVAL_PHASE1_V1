"""Vendor Trust Score (VTS) formula — ported from TypeScript vendorAttestation.ts."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from exceptions.custom_exceptions import RiskCalculationException
from services import attestation_answer_map as answers
from services.category_coverage_service import resolve_category_coverage_inputs
from services.cert_industry_segment import (
    CERT_FRAMEWORK_MAX_POINTS,
    CERT_MUTUALLY_EXCLUSIVE_TIERS,
    get_relevant_certification_framework_set,
    normalize_cert_industry_segment_input,
)
from services.compliance_cert_blobs import (
    certification_form_text_from_getter,
    collect_compliance_upload_file_names,
)

SCORING_VERSION = "vts-2.1"
CALIBRATION_VERSION = "vts-2.1-cal-2026-09-22"

# Document 1 §4.3 — Weight is the value in force now. Unknown domains still
# return a defined weight (Document 1: the function must not fail closed).
DOMAIN_WEIGHTS = {
    "Malicious Actors and Misuse": 1.20,
    "Privacy and Security": 1.15,
    "AI System Safety, Failures and Limitations": 1.15,
    "Discrimination and Toxicity": 1.10,
    "Misinformation": 1.10,
    "Human-Computer Interaction": 1.05,
    "Socioeconomic and Environmental": 0.90,
}
DOMAIN_WEIGHT_ALIASES = {
    "Privacy & Security": "Privacy and Security",
    "AI System Safety": "AI System Safety, Failures and Limitations",
    "Fairness & Non-discrimination": "Discrimination and Toxicity",
    "Transparency & Explainability": "Human-Computer Interaction",
    "Human Oversight": "Human-Computer Interaction",
    "Accountability & Governance": "Malicious Actors and Misuse",
    "Socioeconomic Impact": "Socioeconomic and Environmental",
}
DEFAULT_DOMAIN_WEIGHT = 1.00
CM_CLAMP = (0.143, 3.1)

GOVERNANCE_GROUP_LABELS = {
    "certifications_score": "Certifications",
    "assessment_quality_score": "Assessment Quality",
    "policy_score": "Policies",
    "operational_controls_score": "Operational Controls",
    "vendor_maturity_adjustment": "Vendor Maturity",
    "data_protection_score": "Data Protection",
    "supply_chain_score": "Supply Chain",
    "adversarial_disclosure_score": "Adversarial Disclosure",
    "dpa_score": "Data Processing Agreement",
}
OPERATIONAL_GROUP_LABELS = {
    "sla_score": "Service Levels",
    "incident_management_score": "Incident Management",
    "deployment_maturity_score": "Deployment Maturity",
    "stability_score": "Company Stability",
    "support_score": "Support",
}

PILLAR_WEIGHTS = {
    "product": 0.40,
    "governance": 0.30,
    "operational": 0.30,
}

MITIGATION_CATEGORIES = [
    "Data Governance & Privacy Controls",
    "Model Security & Integrity",
    "Access Management & Authentication",
    "Testing & Auditing Procedures",
    "Post-Deployment Monitoring",
    "Incident Response & Recovery",
    "Transparency & Documentation",
    "Human Oversight Mechanisms",
    "Bias Detection & Mitigation",
    "Adversarial Robustness",
    "Supply Chain Security",
    "Compliance & Regulatory Adherence",
    "User Education & Awareness",
]
# Document 1 §4.4 — no collectable input; drop from required and the denominator.
EXCLUDED_MITIGATION_CATEGORIES = {
    "Access Management & Authentication",
    "User Education & Awareness",
}

LooseInput = dict[str, Any]


def _pf(value: float, digits: int = 4) -> float:
    return float(f"{value:.{digits}f}")


def _has_input(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    if isinstance(value, (list, dict)) and len(value) == 0:
        return False
    return True


def _domain_weight_for(domain: Any) -> tuple[str, float]:
    name = str(domain or "").strip()
    canonical = DOMAIN_WEIGHT_ALIASES.get(name, name)
    if canonical in DOMAIN_WEIGHTS:
        return canonical, DOMAIN_WEIGHTS[canonical]
    return canonical or str(domain), DEFAULT_DOMAIN_WEIGHT


def _stake_from_impact_scores(impact_scores: list[float]) -> str | None:
    """Document 1 §4.2 — stake proxied from median impact of the applicable set."""
    if not impact_scores:
        return None
    ordered = sorted(float(x) for x in impact_scores)
    median = ordered[len(ordered) // 2]
    if median <= 1.5:
        return "Low"
    if median <= 2.5:
        return "Moderate"
    if median <= 3.5:
        return "High"
    if median <= 4.5:
        return "Critical"
    return "Life-Critical"


def _component(key: str, label: str, earned: float, attainable: float) -> dict[str, Any]:
    """One scorable line item. `attainable` is what this line can actually award."""
    capped = max(0.0, min(float(earned), float(attainable)))
    return {
        "key": key,
        "label": label,
        "earned": _pf(capped),
        "attainable": _pf(float(attainable)),
    }


def _roll_up(components: list[dict[str, Any]]) -> tuple[float, float]:
    return (
        sum(float(c["earned"]) for c in components),
        sum(float(c["attainable"]) for c in components),
    )


def _normalise_pillar(
    groups: list[tuple[str, dict[str, Any], bool]],
    labels: dict[str, str],
) -> dict[str, Any]:
    """Document 0 §3: Pillar_Risk = 100 × (1 − earned / attainable). Absent groups drop out.

    A group's attainable is the sum of its own line items, so no earned point is
    ever discarded and the line items reconcile with the pillar score exactly.
    """
    earned = 0.0
    attainable = 0.0
    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    components: list[dict[str, Any]] = []
    for name, result, has_input in groups:
        group_components = list(result.get("components") or [])
        group_earned, group_attainable = _roll_up(group_components)
        if group_attainable <= 0:
            excluded.append({"group": name, "reason": "nothing_attainable"})
            continue
        if not has_input:
            excluded.append({"group": name, "reason": "no_input"})
            continue
        earned += group_earned
        attainable += group_attainable
        included.append({
            "group": name,
            "label": labels.get(name, name),
            "earned": _pf(group_earned),
            "attainable": _pf(group_attainable),
        })
        for row in group_components:
            components.append({**row, "group": name, "group_label": labels.get(name, name)})
    if attainable <= 0:
        return {
            "earned": 0.0,
            "attainable": 0.0,
            "included_groups": included,
            "excluded_groups": excluded,
            "components": components,
            "not_implemented": True,
            "value": None,
        }
    ratio = earned / attainable
    risk = 100.0 * (1.0 - ratio)
    clamped = max(0.0, min(100.0, risk))
    return {
        "earned": _pf(earned),
        "attainable": _pf(attainable),
        "included_groups": included,
        "excluded_groups": excluded,
        "components": components,
        "not_implemented": False,
        "raw_risk": _pf(risk),
        "value": _pf(clamped),
    }


def _redistribute_pillar_weights(active: dict[str, bool]) -> dict[str, float]:
    base = dict(PILLAR_WEIGHTS)
    live = {k: v for k, v in base.items() if active.get(k, True)}
    total = sum(live.values())
    if total <= 0:
        return {k: 0.0 for k in base}
    return {k: (live[k] / total if k in live else 0.0) for k in base}


def _score_list(
    raw: Any,
    *,
    lo: float = 1.0,
    hi: float = 5.0,
) -> list[float]:
    """Parse a list of Risk Intellect scores. Absent input stays absent — no stubs."""
    if not isinstance(raw, list):
        return []
    out: list[float] = []
    for item in raw:
        try:
            n = float(item)
        except (TypeError, ValueError):
            continue
        if n != n or n <= 0:
            continue
        out.append(max(lo, min(hi, n)))
    return out


def calculate_likelihood(likelihood_scores: list[float]) -> dict[str, Any]:
    if not likelihood_scores:
        raise RiskCalculationException("likelihoodScores must be a non-empty array")
    value = sum(likelihood_scores) / len(likelihood_scores)
    return {"value": _pf(value), "riskCount": len(likelihood_scores)}


def calculate_impact(impact_scores: list[float]) -> dict[str, Any]:
    if not impact_scores:
        raise RiskCalculationException("impactScores must be a non-empty array")
    value = sum(impact_scores) / len(impact_scores)
    return {"value": _pf(value), "riskCount": len(impact_scores)}


def calculate_severity(severity_scores: list[float]) -> dict[str, Any]:
    if not severity_scores:
        raise RiskCalculationException("severityScores must be a non-empty array")
    value = sum(severity_scores) / len(severity_scores)
    return {"value": _pf(value), "riskCount": len(severity_scores)}


def calc_entity_type_multiplier(p: LooseInput) -> dict[str, Any]:
    base_map = {
        "advisory": 0.8,
        "assisted": 0.9,
        "supervised": 1.0,
        "autonomous": 1.2,
        "fully_autonomous": 1.3,
    }
    stake_map = {
        "Low": -0.1,
        "Moderate": 0.0,
        "High": 0.1,
        "Critical": 0.15,
        "Life-Critical": 0.2,
    }
    unmatched: list[dict[str, Any]] = []
    autonomy = p.get("decisionAutonomyLevel")
    base = base_map.get(autonomy)
    if base is None:
        if _has_input(autonomy):
            unmatched.append({"field": "decisionAutonomyLevel", "value": autonomy})
        base = 1.0
    impact_scores = p.get("impactScores") if isinstance(p.get("impactScores"), list) else []
    stake_from_impact = _stake_from_impact_scores(
        [float(x) for x in impact_scores if isinstance(x, (int, float))]
    )
    stake_level = stake_from_impact or p.get("decisionStakeLevel")
    stake_adj = stake_map.get(stake_level)
    if stake_adj is None:
        if _has_input(stake_level):
            unmatched.append({"field": "decisionStakeLevel", "value": stake_level})
        stake_adj = 0.0
    return {
        "et_base": base,
        "stake_level": stake_level,
        "stake_source": "median_impact" if stake_from_impact else "payload",
        "stake_adjustment": stake_adj,
        "unmatched": unmatched,
        "value": _pf(base + stake_adj),
    }


def calc_timing_multiplier(p: LooseInput) -> dict[str, Any]:
    base_map = {
        "design": 0.75,
        "development": 0.80,
        "testing": 0.85,
        "staging": 0.95,
        "production": 1.30,
        # Product Stage answers distinguish new vs mature production; both are live.
        "production_new": 1.30,
        "production_mature": 1.30,
    }
    phase_map = {
        "pre_procurement": -0.05,
        "vendor_evaluation": -0.03,
        "pilot": 0.0,
        "scaling": 0.05,
        "mature_deployment": 0.10,
    }
    unmatched: list[dict[str, Any]] = []
    stage = p.get("devStage")
    phase = p.get("assessmentPhase")
    base = base_map.get(stage)
    phase_adj = phase_map.get(phase)
    if base is None:
        if _has_input(stage):
            unmatched.append({"field": "devStage", "value": stage})
        base = 1.0
    if phase_adj is None:
        if _has_input(phase):
            unmatched.append({"field": "assessmentPhase", "value": phase})
        phase_adj = 0.0
    return {
        "tm_base": base,
        "phase_adjustment": phase_adj,
        "unmatched": unmatched,
        "value": _pf(base + phase_adj),
    }


def calc_architecture_multiplier(p: LooseInput) -> dict[str, Any]:
    base_map = {
        "off_the_shelf": 0.70,
        "lightly_customized": 0.85,
        "moderately_customized": 1.00,
        "heavily_customized": 1.20,
        "fully_custom": 1.40,
    }
    integ_map = {
        "standalone": 0.00,
        "simple_api": 0.05,
        "moderate_integration": 0.10,
        "complex_integration": 0.15,
        "legacy_systems": 0.20,
    }
    host_map = {
        "cloud_hosted": 0.00,
        "on_premise": 0.05,
        "hybrid": 0.08,
        "edge_devices": 0.10,
    }
    unmatched: list[dict[str, Any]] = []
    base = base_map.get(p.get("customizationLevel"))
    if base is None:
        if _has_input(p.get("customizationLevel")):
            unmatched.append({"field": "customizationLevel", "value": p.get("customizationLevel")})
        base = 1.00
    integ_adj = integ_map.get(p.get("integrationComplexity"))
    if integ_adj is None:
        if _has_input(p.get("integrationComplexity")):
            unmatched.append({"field": "integrationComplexity", "value": p.get("integrationComplexity")})
        integ_adj = 0.0
    host_raw = p.get("hostingType")
    host_items = host_raw if isinstance(host_raw, list) else [host_raw]
    host_adjs: list[float] = []
    for item in host_items:
        key = str(item or "").strip()
        if not key:
            continue
        if key in host_map:
            host_adjs.append(host_map[key])
        else:
            unmatched.append({"field": "hostingType", "value": key})
    # Document 1 §4.2 — hosting is multi-select; take the MAX adjustment.
    host_adj = max(host_adjs) if host_adjs else 0.0
    return {
        "am_base": base,
        "integration_adj": integ_adj,
        "hosting_adj": host_adj,
        "hosting_values": [str(x) for x in host_items if x],
        "unmatched": unmatched,
        "value": _pf(base + integ_adj + host_adj),
    }


def calc_scale_multiplier(p: LooseInput) -> dict[str, Any]:
    emp_map = {
        "1-10": 0.70,
        "11-50": 0.75,
        "51-200": 0.80,
        "201-1000": 0.90,
        "1001-5000": 1.00,
        "5001-10000": 1.10,
        "10000+": 1.20,
    }
    geo_map = {
        "single_location": 1.00,
        "regional": 1.05,
        "national": 1.10,
        "multi_national": 1.15,
        "global": 1.20,
    }
    data_map = {
        "minimal": 0.00,
        "moderate": 0.03,
        "large": 0.06,
        "very_large": 0.09,
        "petabyte_scale": 0.12,
    }
    unmatched: list[dict[str, Any]] = []
    employee = p.get("employeeCount")
    geography = p.get("geographicRegions")
    emp_base = emp_map.get(employee)
    if emp_base is None:
        if _has_input(employee):
            unmatched.append({"field": "employeeCount", "value": employee})
        emp_base = 1.00
    geo_factor = geo_map.get(geography)
    if geo_factor is None:
        if _has_input(geography):
            unmatched.append({"field": "geographicRegions", "value": geography})
        geo_factor = 1.00
    data_raw = p.get("dataVolumeScale")
    if _has_input(data_raw) and data_raw not in data_map:
        unmatched.append({"field": "dataVolumeScale", "value": data_raw})
    data_adj = data_map.get(data_raw, 0.0) if data_raw else 0.0
    return {
        "employee_base": emp_base,
        "geographic_factor": geo_factor,
        "data_volume_adj": data_adj,
        "unmatched": unmatched,
        "value": _pf((emp_base * geo_factor) + data_adj),
    }


def calc_risk_tolerance_multiplier(p: LooseInput) -> dict[str, Any]:
    mapping = {
        "aggressive": 0.85,
        "moderate": 1.00,
        "conservative": 1.15,
        "risk_averse": 1.25,
    }
    value = mapping.get(p.get("aiRiskAppetite"))
    if value is None:
        raise RiskCalculationException(f"Unknown aiRiskAppetite: {p.get('aiRiskAppetite')}")
    return {"value": value}


def calc_intent_multiplier(p: LooseInput) -> dict[str, Any]:
    intentional = int(p.get("intentionalRiskCount") or 0)
    unintentional = int(p.get("unintentionalRiskCount") or 0)
    total = intentional + unintentional
    if total == 0:
        return {
            "intentional_count": 0,
            "unintentional_count": 0,
            "intentional_pct": 0.0,
            "unintentional_pct": 0.0,
            "profile": "insufficient_evidence",
            "value": 1.0,
        }
    intentional_pct = intentional / total
    unintentional_pct = unintentional / total
    if intentional_pct > 0.6:
        value, profile = 1.2, "Intentional"
    elif unintentional_pct > 0.6:
        value, profile = 0.7, "Unintentional"
    else:
        value, profile = 1.0, "Mixed"
    return {
        "intentional_count": intentional,
        "unintentional_count": unintentional,
        "intentional_pct": _pf(intentional_pct * 100, 2),
        "unintentional_pct": _pf(unintentional_pct * 100, 2),
        "profile": profile,
        "value": value,
    }


def calculate_combined_contextual_multiplier(params: LooseInput) -> dict[str, Any]:
    # Document 1 §4.2: CM = clamp(ET × TM × AM × SM_scale × IM, 0.143, 3.1).
    # Risk Tolerance Multiplier is a buyer input and is not applied to VTS.
    et = calc_entity_type_multiplier(params)
    tm = calc_timing_multiplier(params)
    am = calc_architecture_multiplier(params)
    sm = calc_scale_multiplier(params)
    im = calc_intent_multiplier(params)
    raw = float(et["value"]) * float(tm["value"]) * float(am["value"]) * float(sm["value"]) * float(im["value"])
    lo, hi = CM_CLAMP
    clamped = max(lo, min(hi, raw))
    return {
        "entity_type_multiplier": et,
        "timing_multiplier": tm,
        "architecture_multiplier": am,
        "scale_multiplier": sm,
        "intent_multiplier": im,
        "raw_value": _pf(raw),
        "clamp": {"min": lo, "max": hi},
        "value": _pf(clamped),
    }


def calculate_domain_weight(applicable_domains: list[dict[str, Any]]) -> dict[str, Any]:
    if not applicable_domains:
        raise RiskCalculationException("applicableDomains must be a non-empty array")
    weighted_sum = 0.0
    total_risks = 0
    breakdown = []
    for d in applicable_domains:
        domain = d.get("domain")
        risk_count = int(d.get("riskCount") or 0)
        canonical, w = _domain_weight_for(domain)
        weighted_sum += w * risk_count
        total_risks += risk_count
        breakdown.append({
            "domain": canonical,
            "source_domain": domain,
            "weight": w,
            "risk_count": risk_count,
            "contribution": _pf(w * risk_count),
        })
    value = _pf(weighted_sum / total_risks)
    return {
        "breakdown": breakdown,
        "weighted_sum": _pf(weighted_sum),
        "total_risks": total_risks,
        "value": value,
    }


def calculate_sector_modifier(p: LooseInput) -> dict[str, Any]:
    sm_base = 0
    use_case_adj = 0
    adj_breakdown: list[dict[str, Any]] = []
    sector = p.get("sector")

    if sector == "Healthcare":
        cap_map = {
            "diagnostic": 8,
            "treatment_recommendation": 8,
            "patient_communication": 6,
            "administrative": 4,
            "research": 3,
        }
        sm_base = cap_map.get(p.get("aiCapabilityType"), 5)
        if p.get("piiHandling") == "critical":
            use_case_adj += 2
            adj_breakdown.append({"reason": "critical PHI handling", "points": 2})
        reg = p.get("regulatoryComplexity") or []
        if isinstance(reg, list) and "FDA_clearance" in reg:
            use_case_adj += 1
            adj_breakdown.append({"reason": "FDA clearance required", "points": 1})
        if p.get("deploymentScale") == "multi_hospital_system":
            use_case_adj += 1
            adj_breakdown.append({"reason": "multi-hospital deployment", "points": 1})
        if p.get("patientDemographic") in ("pediatric", "elderly"):
            use_case_adj += 1
            adj_breakdown.append({"reason": "vulnerable population", "points": 1})
    elif sector == "Financial Services":
        sm_base = 5
    elif sector == "Autonomous Vehicles":
        sm_base = 6
    elif sector == "Government":
        sm_base = 5
    elif sector == "E-Commerce":
        sm_base = 3
    elif sector == "Technology":
        sm_base = 1
    else:
        sm_base = 1

    return {
        "sector": sector,
        "sm_base": sm_base,
        "use_case_adjustment": use_case_adj,
        "adjustment_breakdown": adj_breakdown,
        "value": sm_base + use_case_adj,
    }


def calculate_inherent_risk(*, L: float, I: float, CM: float, DW: float, SM: float) -> dict[str, Any]:
    base_risk = _pf(L * I)
    contextual_risk = _pf(base_risk * CM)
    domain_weighted_risk = _pf(contextual_risk * DW)
    sector_adjusted_risk = _pf(domain_weighted_risk + SM)
    normalized_risk = _pf(sector_adjusted_risk * 4)
    capped_risk = min(100.0, normalized_risk)
    return {
        "base_risk": base_risk,
        "contextual_risk": contextual_risk,
        "domain_weighted_risk": domain_weighted_risk,
        "sector_adjusted_risk": sector_adjusted_risk,
        "normalized_risk": normalized_risk,
        "value": _pf(capped_risk),
    }


def calc_category_coverage(p: LooseInput) -> dict[str, Any]:
    required_categories = [
        c for c in (p.get("requiredCategories") or [])
        if c not in EXCLUDED_MITIGATION_CATEGORIES
    ]
    implemented_categories = [
        c for c in (p.get("implementedCategories") or [])
        if c not in EXCLUDED_MITIGATION_CATEGORIES
    ]
    required = set(required_categories)
    implemented = [c for c in implemented_categories if c in required]
    coverage = len(implemented) / len(required) if required else 0.0
    return {
        "required_categories": list(required),
        "required_count": len(required),
        "implemented_categories": implemented,
        "implemented_count": len(implemented),
        "missing_categories": [c for c in required if c not in implemented],
        "value": _pf(coverage),
    }


def calc_evidence_quality(mitigations: list[dict[str, Any]]) -> dict[str, Any]:
    if not mitigations:
        return {
            "breakdown": [],
            "total_weighted": 0.0,
            "total_risk_instances": 0,
            "value": 0.0,
        }
    weighted_sum = 0.0
    total_risk_instances = 0
    breakdown = []
    for m in mitigations:
        risk_count = int(m.get("riskCount") or 0)
        avg_relevance = float(m.get("avgRelevance") or 0)
        contribution = risk_count * avg_relevance
        weighted_sum += contribution
        total_risk_instances += risk_count
        breakdown.append({
            "mitigation_id": m.get("mitigationId"),
            "risk_count": risk_count,
            "avg_relevance": avg_relevance,
            "weighted_contribution": _pf(contribution),
        })
    return {
        "breakdown": breakdown,
        "total_weighted": _pf(weighted_sum),
        "total_risk_instances": total_risk_instances,
        "value": _pf(weighted_sum / total_risk_instances) if total_risk_instances else 0.0,
    }


def calculate_mitigation_effectiveness(p: LooseInput) -> dict[str, Any]:
    coverage = calc_category_coverage(p)
    quality = calc_evidence_quality(p.get("mitigations") or [])
    value = _pf((coverage["value"] * 0.6) + (quality["value"] * 0.4))
    return {
        "category_coverage": coverage,
        "evidence_quality": quality,
        "coverage_weight": 0.6,
        "quality_weight": 0.4,
        "value": value,
    }


def calculate_confidence_factor(p: LooseInput) -> dict[str, Any]:
    """Document 1 §4.5 — corroboration only. Assessment method is owned by Governance."""
    unmatched: list[dict[str, Any]] = []
    evidence_adj: list[dict[str, Any]] = []
    factor = 1.0

    cert_file = bool(
        p.get("complianceDocumentationComplete") is True
        or p.get("certificationFilePresent") is True
        or str(p.get("complianceUploadBlob") or "").strip()
    )
    expiry_raw = p.get("certificationExpiryDate") or p.get("certification_expiry_date")
    expiry_ok = False
    if cert_file:
        expiry_ok = _cert_expiry_current(expiry_raw, p.get("certificates"))
        if expiry_ok:
            factor *= 0.95
            evidence_adj.append({
                "reason": "certification file present and in date",
                "multiplier": 0.95,
            })
        else:
            evidence_adj.append({
                "reason": "certification file present but expired or undated — no credit",
                "multiplier": 1.0,
            })

    cadence = str(
        p.get("independentPenTestFrequency")
        or p.get("independent_pen_test_frequency")
        or ""
    ).strip().lower()
    annual_or_better = cadence in {"continuous", "quarterly", "annually", "annual", "bi_annual"}
    if annual_or_better:
        factor *= 0.97
        evidence_adj.append({
            "reason": f"independent pen-test cadence: {cadence}",
            "multiplier": 0.97,
        })
    elif cadence:
        unmatched.append({"field": "independentPenTestFrequency", "value": cadence})

    testing = str(
        p.get("testingResultsAvailable") or p.get("testing_results_available") or ""
    ).strip().lower()
    if "comprehensive" in testing:
        factor *= 0.98
        evidence_adj.append({
            "reason": "testing results comprehensive",
            "multiplier": 0.98,
        })

    trust_url = str(
        p.get("trustCenterUrl") or p.get("trust_center_url") or ""
    ).strip()
    if trust_url:
        factor *= 0.98
        evidence_adj.append({
            "reason": "trust-centre URL published",
            "multiplier": 0.98,
        })

    lo, hi = 0.80, 1.20
    clamped = max(lo, min(hi, factor))
    return {
        "method_base": 1.0,
        "evidence_adjustments": evidence_adj,
        "pen_test_cadence": cadence or None,
        "cert_file_present": cert_file,
        "cert_expiry_current": expiry_ok if cert_file else None,
        "unmatched": unmatched,
        "raw_value": _pf(factor),
        "value": _pf(clamped),
    }


def _cert_expiry_current(expiry_raw: Any, certificates: Any) -> bool:
    today = datetime.now().date()

    def parse_one(raw: Any) -> bool | None:
        if raw in (None, "", False):
            return None
        if isinstance(raw, datetime):
            return raw.date() >= today
        text = str(raw).strip()[:10]
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(text, fmt).date() >= today
            except ValueError:
                continue
        return None

    direct = parse_one(expiry_raw)
    if direct is True:
        return True
    if isinstance(certificates, list):
        found_valid = False
        found_any = False
        for row in certificates:
            if not isinstance(row, dict):
                continue
            found_any = True
            parsed = parse_one(row.get("expiryDate") or row.get("expiry") or row.get("valid_until"))
            if parsed is True:
                found_valid = True
        if found_valid:
            return True
        if found_any:
            return False
    # File present with no expiry recorded: do not credit (Document 1 T1-04 / expiry gate).
    return False


def calculate_product_risk(
    *,
    inherent_risk: float,
    mitigation_effectiveness: float,
    confidence_factor: float,
) -> dict[str, Any]:
    residual = inherent_risk * (1 - mitigation_effectiveness)
    raw = residual * confidence_factor
    clamped = max(0.0, min(100.0, raw))
    return {
        "inherent_risk": inherent_risk,
        "mitigation_effectiveness": mitigation_effectiveness,
        "residual_pre_confidence": _pf(residual),
        "confidence_factor": confidence_factor,
        "raw_value": _pf(raw),
        "value": _pf(clamped),
    }


def _structured_certificate_status(
    p: LooseInput,
    fw_regex: re.Pattern[str],
) -> str:
    """Return current, expired_or_undated, or self_attested for one framework.

    Document 1 §4.5 requires the evidence tier to come from the
    per-certificate evidence record. Free text near a framework name is never
    treated as audited evidence.
    """
    certificates = p.get("certificates")
    if not isinstance(certificates, list):
        return "self_attested"
    matched = False
    for row in certificates:
        if not isinstance(row, dict):
            continue
        evidence_text = " ".join(
            str(row.get(key) or "")
            for key in (
                "name",
                "certificateType",
                "complianceType",
                "documentClass",
                "frameworkMapping",
            )
        )
        if not fw_regex.search(evidence_text):
            continue
        matched = True
        expiry = row.get("expiryDate") or row.get("expiry") or row.get("valid_until")
        if _cert_expiry_current(expiry, [row]):
            return "current"
    return "expired_or_undated" if matched else "self_attested"


def _certification_components(
    relevant_frameworks: set[str],
    contributing: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """One line item per certification the buyer's segment actually cares about.

    Lower tiers of a certification the vendor already holds at a higher tier are
    dropped, so holding SOC 2 Type 2 does not leave a phantom SOC 2 Type 1 gap.
    """
    awarded = {str(row["framework"]): float(row["points"]) for row in contributing}
    superseded: set[str] = set()
    for tiers in CERT_MUTUALLY_EXCLUSIVE_TIERS:
        present = [t for t in tiers if t in relevant_frameworks]
        if not present:
            continue
        held = next((t for t in present if awarded.get(t, 0) > 0), None)
        keep = held or present[0]
        superseded.update(t for t in present if t != keep)

    components: list[dict[str, Any]] = []
    for framework in sorted(relevant_frameworks):
        if framework in superseded:
            continue
        attainable = CERT_FRAMEWORK_MAX_POINTS.get(framework)
        if not attainable:
            continue
        components.append(
            _component(
                f"cert::{framework}",
                framework,
                awarded.get(framework, 0.0),
                attainable,
            )
        )
    return components


def calc_certifications_score(p: LooseInput) -> dict[str, Any]:
    combined = str(p.get("certificationsSearchBlob") or "").lower()
    if not combined.strip():
        legacy = []
        if p.get("soc2Certification") and p.get("soc2Certification") != "None":
            legacy.append(str(p.get("soc2Certification")))
        if p.get("isoCertifications") and p.get("isoCertifications") != "None":
            legacy.append(str(p.get("isoCertifications")))
        if p.get("hipaaCertification") and p.get("hipaaCertification") != "None":
            legacy.append(str(p.get("hipaaCertification")))
        combined = " ".join(legacy).lower()

    breakdown: list[dict[str, Any]] = []

    def add(key: str, pts: float, detail: str | None = None) -> None:
        if pts <= 0:
            return
        row: dict[str, Any] = {"framework": key, "points": pts}
        if detail:
            row["detail"] = detail
        breakdown.append(row)

    soc2_points = 0
    if re.search(r"\bsoc\s*2\b|soc2", combined, re.I):
        if re.search(r"type\s*2|type\s*ii|type2", combined, re.I):
            soc2_points = 15
        elif re.search(r"type\s*1|type\s*i\b|type1", combined, re.I):
            soc2_points = 8
    if soc2_points == 15:
        add("SOC 2 Type 2", 15)
    elif soc2_points == 8:
        add("SOC 2 Type 1", 8)

    if re.search(r"hipaa", combined, re.I) and re.search(r"hitrust", combined, re.I):
        add("HIPAA BAA + HITRUST", 15)
    elif re.search(r"hipaa|\bbaa\b", combined, re.I):
        add("HIPAA BAA only", 10)

    iso27001_re = re.compile(r"\biso\s*27001\b|27001:2022|\b27001\b", re.I)
    if iso27001_re.search(combined):
        status = _structured_certificate_status(p, iso27001_re)
        if status != "expired_or_undated":
            add("ISO 27001:2022", 10 if status == "current" else 5, status.replace("_", "-"))

    iso42001_re = re.compile(r"\biso\s*42001\b|\b42001\b", re.I)
    if iso42001_re.search(combined):
        status = _structured_certificate_status(p, iso42001_re)
        if status != "expired_or_undated":
            add("ISO 42001", 8 if status == "current" else 4, status.replace("_", "-"))

    if re.search(r"nist", combined, re.I) and re.search(
        r"ai\s*rmf|ai\s*risk\s*management(\s*framework)?", combined, re.I
    ):
        add("NIST AI RMF", 5, "self-attested")

    if (
        re.search(r"nist", combined, re.I)
        and re.search(r"(\bcsf\b|cybersecurity\s*framework)", combined, re.I)
        and not re.search(r"800[\s.-]*53", combined)
        and not re.search(r"800[\s.-]*171", combined)
    ):
        add("NIST CSF v2.0", 5, "self-attested")

    n53_re = re.compile(r"800[\s.-]*53\b", re.I)
    if n53_re.search(combined):
        status = _structured_certificate_status(p, n53_re)
        if status != "expired_or_undated":
            add("NIST SP 800-53 Rev 5", 10 if status == "current" else 5, status.replace("_", "-"))

    n171_re = re.compile(r"800[\s.-]*171\b", re.I)
    if n171_re.search(combined):
        status = _structured_certificate_status(p, n171_re)
        if status != "expired_or_undated":
            add("NIST SP 800-171 Rev 3", 10 if status == "current" else 5, status.replace("_", "-"))

    if re.search(r"\bcmmc\b", combined, re.I):
        add("CMMC v2 Level 2+", 12)

    if re.search(r"pci[\s.-]*dss|payment card industry", combined, re.I):
        add("PCI DSS 4.0", 10)

    dora_re = re.compile(r"\bdora\b|digital operational resilience", re.I)
    if dora_re.search(combined):
        status = _structured_certificate_status(p, dora_re)
        if status != "expired_or_undated":
            add("DORA", 8 if status == "current" else 4, status.replace("_", "-"))

    gdpr_re = re.compile(r"\bgdpr\b|general data protection regulation", re.I)
    if gdpr_re.search(combined):
        status = _structured_certificate_status(p, gdpr_re)
        if status != "expired_or_undated":
            add("GDPR", 8 if status == "current" else 4, status.replace("_", "-"))

    segment_key = normalize_cert_industry_segment_input(str(p.get("buyerIndustrySegment") or ""))
    relevant_frameworks = get_relevant_certification_framework_set(segment_key)
    all_rows = breakdown
    all_detected_breakdown = [dict(row) for row in all_rows]
    contributing = [row for row in all_rows if row["framework"] in relevant_frameworks]
    excluded_by_segment = [row for row in all_rows if row["framework"] not in relevant_frameworks]
    raw_sum_all = sum(float(row["points"]) for row in all_rows)
    raw_sum = sum(float(row["points"]) for row in contributing)
    value = raw_sum

    components = _certification_components(relevant_frameworks, contributing)

    soc2_contrib = (
        15 if any(r["framework"] == "SOC 2 Type 2" for r in contributing)
        else (8 if any(r["framework"] == "SOC 2 Type 1" for r in contributing) else 0)
    )
    hipaa_contrib = (
        15 if any(r["framework"] == "HIPAA BAA + HITRUST" for r in contributing)
        else (10 if any(r["framework"] == "HIPAA BAA only" for r in contributing) else 0)
    )
    iso27001_contrib = float(next((r["points"] for r in contributing if r["framework"] == "ISO 27001:2022"), 0))
    iso42001_contrib = float(next((r["points"] for r in contributing if r["framework"] == "ISO 42001"), 0))

    return {
        "buyer_industry_segment": segment_key,
        "relevant_framework_keys": sorted(relevant_frameworks),
        "all_detected_breakdown": all_detected_breakdown,
        "framework_breakdown": contributing,
        "excluded_not_relevant_to_buyer_segment": excluded_by_segment,
        "raw_certifications_sum_all_detected": raw_sum_all,
        "raw_certifications_sum": raw_sum,
        "components": components,
        "attainable": _roll_up(components)[1],
        "soc2_points": soc2_contrib,
        "hipaa_points": hipaa_contrib,
        "iso_points": iso27001_contrib + iso42001_contrib,
        "iso_27001_points": iso27001_contrib,
        "iso_42001_points": iso42001_contrib,
        "value": value,
    }


def calc_assessment_quality_score(p: LooseInput) -> dict[str, Any]:
    method_map = {
        "third_party_audit": 20,
        "third_party_review": 15,
        "internal_audit": 10,
        "self_reported_verified": 5,
        "self_reported_unverified": 3,
        "no_formal_assessment": 0,
    }
    freq_map = {"annual": 5, "bi_annual": 3, "ad_hoc": 0}
    unmatched: list[dict[str, Any]] = []
    method = p.get("assessmentMethod")
    has_method = _has_input(method)
    if has_method and method not in method_map:
        unmatched.append({"field": "assessmentMethod", "value": method})
    base = method_map.get(method, 0) if has_method else 0
    is_audit = method in ("third_party_audit", "internal_audit")
    freq = p.get("auditFrequency")
    freq_bonus = freq_map.get(freq, 0) if is_audit and _has_input(freq) else 0
    if is_audit and _has_input(freq) and freq not in freq_map:
        unmatched.append({"field": "auditFrequency", "value": freq})
    components = [
        _component("assessment_method", "Security Assessment Method", base, 20),
        _component("audit_frequency", "Audit Frequency", freq_bonus, 5),
    ]
    return {
        "method_base": base,
        "frequency_bonus": freq_bonus,
        "unmatched": unmatched,
        "has_input": has_method,
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": base + freq_bonus,
    }


def calc_policy_score(p: LooseInput) -> dict[str, Any]:
    retention_map = {"documented_and_enforced": 12, "documented_not_enforced": 8, "informal": 3}
    ir_map = {"tested_annually": 15, "documented_not_tested": 10, "basic_runbook": 5}
    privacy_map = {"comprehensive_gdpr_ccpa": 10, "standard": 6, "basic": 3}
    ethics_map = {"board_approved_operationalized": 8, "documented_not_operationalized": 5, "draft": 2}
    unmatched: list[dict[str, Any]] = []

    retention_on = p.get("dataRetentionPolicy")
    retention_level = p.get("dataRetentionPolicyCompleteness")
    if retention_on and _has_input(retention_level) and retention_level not in retention_map:
        unmatched.append({"field": "dataRetentionPolicyCompleteness", "value": retention_level})
    retention_points = retention_map.get(retention_level, 0) if retention_on else 0

    ir_on = p.get("incidentResponsePlan")
    ir_level = p.get("incidentResponsePlanMaturity")
    if ir_on and _has_input(ir_level) and ir_level not in ir_map:
        unmatched.append({"field": "incidentResponsePlanMaturity", "value": ir_level})
    ir_points = ir_map.get(ir_level, 0) if ir_on else 0

    privacy_on = p.get("privacyPolicy")
    privacy_level = p.get("privacyPolicyScope")
    if privacy_on and _has_input(privacy_level) and privacy_level not in privacy_map:
        unmatched.append({"field": "privacyPolicyScope", "value": privacy_level})
    privacy_points = privacy_map.get(privacy_level, 0) if privacy_on else 0

    ethics_on = p.get("aiEthicsPolicy")
    ethics_level = p.get("aiEthicsMaturity")
    if ethics_on and _has_input(ethics_level) and ethics_level not in ethics_map:
        unmatched.append({"field": "aiEthicsMaturity", "value": ethics_level})
    ethics_points = ethics_map.get(ethics_level, 0) if ethics_on else 0

    has_input = any([
        retention_on is not None,
        ir_on is not None,
        privacy_on is not None,
        ethics_on is not None,
        _has_input(retention_level),
        _has_input(ir_level),
        _has_input(privacy_level),
        _has_input(ethics_level),
    ])
    components = [
        _component("data_retention", "Data Retention Policy", retention_points, 12),
        _component("incident_response", "Incident Response Plan", ir_points, 15),
        _component("privacy_policy", "Privacy Policy", privacy_points, 10),
        _component("ai_ethics", "AI Ethics Policy", ethics_points, 8),
    ]
    return {
        "data_retention_points": retention_points,
        "incident_response_points": ir_points,
        "privacy_policy_points": privacy_points,
        "ai_ethics_points": ethics_points,
        "unmatched": unmatched,
        "has_input": has_input,
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": retention_points + ir_points + privacy_points + ethics_points,
    }


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _pick(p: LooseInput, *keys: str) -> Any:
    for key in keys:
        if key in p and p.get(key) not in (None, ""):
            return p.get(key)
    return None


def calc_data_protection_score(p: LooseInput) -> dict[str, Any]:
    """Excel: encryption 0-10, TLS 0-8, data-subject rights 0-6."""
    enc_map = {
        "customer_managed_keys": 10,
        "aes_256": 8,
        "platform_managed_keys": 6,
        "aes_128": 4,
    }
    tls_map = {
        "1.3": 8,
        "1.2+": 6,
        "tls 1.2": 4,
        "tls 1.2+": 6,
        "tls 1.3": 8,
        "other": 2,
    }
    rights_set = {
        "access",
        "rectification",
        "erasure",
        "restriction",
        "portability",
        "objection",
    }
    enc_raw = str(_pick(p, "encryptionAtRest", "encryption_at_rest") or "").strip().lower()
    if enc_raw in ("not_disclosed", "not disclosed"):
        enc_raw = ""
    enc_pts = enc_map.get(enc_raw, 0)
    evidence = str(
        _pick(p, "encryptionAtRestEvidenceId", "encryption_at_rest_evidence_id") or ""
    ).strip()
    if enc_pts > 0 and evidence:
        enc_pts = min(10, enc_pts + 2)

    tls_raw = str(_pick(p, "tlsInTransit", "tls_in_transit") or "").strip().lower()
    tls_pts = tls_map.get(tls_raw, 0)

    rights_raw = _pick(p, "dataSubjectRights", "data_subject_rights")
    rights = [
        str(item).strip().lower()
        for item in _as_list(rights_raw)
        if str(item).strip()
    ]
    known = [r for r in rights if r in rights_set]
    role = str(_pick(p, "controllerOrProcessor", "controller_or_processor") or "").strip().lower()
    if role in ("processor", "both"):
        dsr_pts = min(6, len(known))
    elif role == "controller":
        dsr_pts = min(3, int(len(known) * 0.5 + 0.5)) if known else 0
    else:
        dsr_pts = min(6, len(known))
    components = [
        _component("encryption_at_rest", "Encryption at Rest", enc_pts, 10),
        _component("tls_in_transit", "TLS in Transit", tls_pts, 8),
        _component("data_subject_rights", "Data Subject Rights", dsr_pts, 6),
    ]
    return {
        "encryption_points": enc_pts,
        "tls_points": tls_pts,
        "data_subject_rights_points": dsr_pts,
        "has_input": _has_input(enc_raw) or _has_input(tls_raw) or bool(rights),
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": enc_pts + tls_pts + dsr_pts,
    }


def calc_supply_chain_score(p: LooseInput) -> dict[str, Any]:
    """Excel: sub-processors 0-8 (Supply Chain Security)."""
    rows = _as_list(_pick(p, "subProcessors", "sub_processors"))
    named = 0
    detailed = 0
    for item in rows:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        named += 1
        purpose = str(item.get("purpose") or "").strip()
        region = str(item.get("region") or "").strip()
        if purpose and region:
            detailed += 1
    if named <= 0:
        pts = 0
    elif detailed >= 1 and named >= 2:
        pts = 8
    elif detailed >= 1:
        pts = 6
    else:
        pts = 4
    components = [_component("sub_processors", "Sub-processors", pts, 8)]
    return {
        "named_count": named,
        "detailed_count": detailed,
        "has_input": bool(rows),
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": pts,
    }


def calc_adversarial_disclosure_score(p: LooseInput) -> dict[str, Any]:
    """Excel: VDP 0-6, bug bounty 0-4 (Adversarial Robustness)."""
    vdp = _as_dict(_pick(p, "vulnerabilityDisclosurePolicy", "vulnerability_disclosure_policy"))
    vdp_status = str(vdp.get("status") or "").strip().lower()
    vdp_url = str(vdp.get("url") or "").strip()
    if vdp_status == "published" and vdp_url:
        vdp_pts = 6
    elif vdp_status == "published":
        vdp_pts = 4
    elif vdp_status == "on_request":
        vdp_pts = 3
    else:
        vdp_pts = 0

    bounty = _as_dict(_pick(p, "bugBounty", "bug_bounty"))
    bounty_status = str(bounty.get("status") or "").strip().lower()
    bounty_url = str(bounty.get("url") or "").strip()
    if bounty_status == "public" and bounty_url:
        bounty_pts = 4
    elif bounty_status == "public":
        bounty_pts = 3
    elif bounty_status == "private":
        bounty_pts = 2
    else:
        bounty_pts = 0
    components = [
        _component("vdp", "Vulnerability Disclosure Policy", vdp_pts, 6),
        _component("bug_bounty", "Bug Bounty", bounty_pts, 4),
    ]
    return {
        "vdp_points": vdp_pts,
        "bug_bounty_points": bounty_pts,
        "has_input": bool(vdp_status or bounty_status),
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": vdp_pts + bounty_pts,
    }


def calc_dpa_score(p: LooseInput) -> dict[str, Any]:
    """Excel: DPA available 0-4 (Compliance & Regulatory Adherence)."""
    dpa_map = {"publicly_available": 4, "on_request": 2, "none": 0}
    raw = str(_pick(p, "dpaAvailable", "dpa_available") or "").strip().lower()
    pts = dpa_map.get(raw, 0)
    components = [_component("dpa", "DPA Available", pts, 4)]
    return {
        "dpa_status": raw or None,
        "has_input": bool(raw),
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": pts,
    }


def calc_operational_controls_score(p: LooseInput) -> dict[str, Any]:
    # Document 1 §5 — rollback is scored in Operational. Oversight takes MAX over chips.
    oversight_map = {
        "always_in_loop": 12,
        "monitoring_with_intervention": 10,
        "monitoring_only": 6,
        "minimal": 3,
        "none": 0,
    }
    monitor_map = {
        "real_time_alerting": 10,
        "daily_dashboard": 7,
        "weekly_reports": 4,
        "monthly_reviews": 2,
        "none": 0,
    }
    version_map = {"automated_mlops_pipeline": 8, "manual_documented": 5, "basic_tracking": 2}
    unmatched: list[dict[str, Any]] = []

    oversight_raw = p.get("humanOversightCapabilities")
    oversight_items = oversight_raw if isinstance(oversight_raw, list) else [oversight_raw]
    oversight_pts_list: list[float] = []
    for item in oversight_items:
        if not _has_input(item):
            continue
        pts = oversight_map.get(item)
        if pts is None:
            unmatched.append({"field": "humanOversightCapabilities", "value": item})
        else:
            oversight_pts_list.append(float(pts))
    oversight_pts = max(oversight_pts_list) if oversight_pts_list else 0

    monitor_raw = p.get("continuousMonitoring")
    if _has_input(monitor_raw):
        monitor_pts = monitor_map.get(monitor_raw)
        if monitor_pts is None:
            unmatched.append({"field": "continuousMonitoring", "value": monitor_raw})
            monitor_pts = 0
    else:
        monitor_pts = 0

    version_pts = 0
    if p.get("modelVersionControl"):
        version_pts = version_map.get(p.get("versioningMaturity"), 0)

    has_input = bool(oversight_pts_list) or _has_input(monitor_raw) or bool(p.get("modelVersionControl"))
    # Rollback is owned by Operational (incident automation) and is deliberately
    # absent here — it must not appear as a line item this group can never award.
    components = [
        _component("human_oversight", "Human Oversight Capabilities", oversight_pts, 12),
        _component("continuous_monitoring", "Continuous Monitoring", monitor_pts, 10),
        _component("model_version_control", "Model Version Control", version_pts, 8),
    ]
    return {
        "oversight_points": oversight_pts,
        "monitoring_points": monitor_pts,
        "version_control_points": version_pts,
        "unmatched": unmatched,
        "has_input": has_input,
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": oversight_pts + monitor_pts + version_pts,
    }


def calc_vendor_maturity_adjustment(p: LooseInput) -> dict[str, Any]:
    # Document 1 §5 — funding and financial position only.
    # employeeCount is owned by the scale multiplier; yearFounded by Stability.
    unmatched: list[dict[str, Any]] = []
    funding_map = {
        "publicly_traded": 7,
        "series_d_plus": 5,
        "series_b_c": 2,
        "series_a": 0,
        "seed_angel": -3,
    }
    funding_raw = p.get("fundingStatus")
    funding_pts = 0
    funding_present = _has_input(funding_raw)
    if funding_present:
        if funding_raw == "bootstrapped":
            funding_pts = 3 if p.get("revenueSufficient") else -2
        elif funding_raw in funding_map:
            funding_pts = funding_map[funding_raw]
        else:
            unmatched.append({"field": "fundingStatus", "value": funding_raw})

    fin_map = {
        "profitable_3_years": 3,
        "profitable_1_year": 2,
        "break_even": 1,
        "funded_runway_2_years": 1,
        "funded_runway_1_year": 0,
        "uncertain": 0,
    }
    financial_raw = p.get("financialStatus")
    financial_pts = 0
    financial_present = _has_input(financial_raw)
    if financial_present:
        if financial_raw in fin_map:
            financial_pts = fin_map[financial_raw]
        else:
            unmatched.append({"field": "financialStatus", "value": financial_raw})

    components = [
        _component("funding_stability", "Funding Stability", funding_pts, 7),
        _component("financial_position", "Financial Position", financial_pts, 3),
    ]
    return {
        "funding_stability_factor": funding_pts,
        "financial_position_factor": financial_pts,
        "unmatched": unmatched,
        "has_input": funding_present or financial_present,
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": _pf(funding_pts + financial_pts),
    }


def calculate_governance_risk(p: LooseInput) -> dict[str, Any]:
    cert = calc_certifications_score(p)
    aq = calc_assessment_quality_score(p)
    policy = calc_policy_score(p)
    ops = calc_operational_controls_score(p)
    mat = calc_vendor_maturity_adjustment(p)
    data_protection = calc_data_protection_score(p)
    supply_chain = calc_supply_chain_score(p)
    adversarial = calc_adversarial_disclosure_score(p)
    dpa = calc_dpa_score(p)

    cert["has_input"] = bool(
        str(p.get("certificationsSearchBlob") or "").strip()
        or (cert.get("all_detected_breakdown") or cert.get("framework_breakdown"))
    )

    pillar = _normalise_pillar(
        [
            ("certifications_score", cert, bool(cert.get("has_input"))),
            ("assessment_quality_score", aq, bool(aq.get("has_input"))),
            ("policy_score", policy, bool(policy.get("has_input"))),
            ("operational_controls_score", ops, bool(ops.get("has_input"))),
            ("vendor_maturity_adjustment", mat, bool(mat.get("has_input"))),
            ("data_protection_score", data_protection, bool(data_protection.get("has_input"))),
            ("supply_chain_score", supply_chain, bool(supply_chain.get("has_input"))),
            ("adversarial_disclosure_score", adversarial, bool(adversarial.get("has_input"))),
            ("dpa_score", dpa, bool(dpa.get("has_input"))),
        ],
        GOVERNANCE_GROUP_LABELS,
    )
    unmatched = []
    for block in (cert, aq, policy, ops, mat):
        unmatched.extend(block.get("unmatched") or [])

    return {
        "certifications_score": cert,
        "assessment_quality_score": aq,
        "policy_score": policy,
        "operational_controls_score": ops,
        "vendor_maturity_adjustment": mat,
        "data_protection_score": data_protection,
        "supply_chain_score": supply_chain,
        "adversarial_disclosure_score": adversarial,
        "dpa_score": dpa,
        "earned": pillar["earned"],
        "attainable": pillar["attainable"],
        "included_groups": pillar["included_groups"],
        "excluded_groups": pillar["excluded_groups"],
        "components": pillar["components"],
        "unmatched": unmatched,
        "not_implemented": pillar["not_implemented"],
        "calibration_version": CALIBRATION_VERSION,
        "value": pillar["value"] if pillar["value"] is not None else 0.0,
        "pillar": pillar,
    }


def calc_sla_score(p: LooseInput) -> dict[str, Any]:
    uptime_map = {
        "99.99%+": 25,
        "99.95-99.99%": 22,
        "99.9-99.95%": 20,
        "99.5-99.9%": 15,
        "99.0-99.5%": 12,
        "95.0-99.0%": 8,
        "< 95%": 3,
    }
    response_map = {
        "< 15 minutes": 8,
        "< 1 hour": 6,
        "< 4 hours": 4,
        "< 24 hours": 2,
        "> 24 hours": 0,
    }
    resolution_map = {"< 4 hours": 7, "< 24 hours": 5, "< 72 hours": 3, "> 72 hours": 1}
    unmatched: list[dict[str, Any]] = []
    uptime_raw = p.get("slaUptime")
    response_raw = p.get("criticalIncidentResponse")
    resolution_raw = p.get("criticalIncidentResolution")
    uptime_pts = 0
    if _has_input(uptime_raw):
        if uptime_raw in uptime_map:
            uptime_pts = uptime_map[uptime_raw]
        else:
            unmatched.append({"field": "slaUptime", "value": uptime_raw})
    response_pts = 0
    if _has_input(response_raw):
        if response_raw in response_map:
            response_pts = response_map[response_raw]
        else:
            unmatched.append({"field": "criticalIncidentResponse", "value": response_raw})
    resolution_pts = 0
    if _has_input(resolution_raw):
        if resolution_raw in resolution_map:
            resolution_pts = resolution_map[resolution_raw]
        else:
            unmatched.append({"field": "criticalIncidentResolution", "value": resolution_raw})
    components = [
        _component("sla_uptime", "SLA Uptime Commitment", uptime_pts, 25),
        _component("incident_response_sla", "Critical Incident Response SLA", response_pts, 8),
        _component("incident_resolution_sla", "Critical Incident Resolution SLA", resolution_pts, 7),
    ]
    return {
        "uptime_points": uptime_pts,
        "response_time_points": response_pts,
        "resolution_time_points": resolution_pts,
        "unmatched": unmatched,
        "has_input": _has_input(uptime_raw) or _has_input(response_raw) or _has_input(resolution_raw),
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": uptime_pts + response_pts + resolution_pts,
    }


def calc_incident_management_score(p: LooseInput) -> dict[str, Any]:
    plan_map = {"quarterly_drills": 12, "annual_test": 10, "documented_untested": 6}
    auto_map = {
        "automated_instant": 10,
        "automated_manual_trigger": 7,
        "manual_documented": 3,
        "manual_undocumented": 1,
        "none": 0,
    }
    comm_map = {"proactive_status_page": 8, "email_notifications": 5, "reactive_only": 2, "none": 0}
    unmatched: list[dict[str, Any]] = []
    cadence = p.get("planTesting")
    plan_pts = 0
    if _has_input(cadence):
        if cadence in plan_map:
            plan_pts = plan_map[cadence]
        else:
            unmatched.append({"field": "planTesting", "value": cadence})
    rollback = p.get("rollbackProcedures")
    auto_pts = 0
    if _has_input(rollback):
        if rollback in auto_map:
            auto_pts = auto_map[rollback]
        else:
            unmatched.append({"field": "rollbackProcedures", "value": rollback})
    comm = p.get("incidentCommunication")
    comm_pts = 0
    if _has_input(comm):
        if comm in comm_map:
            comm_pts = comm_map[comm]
        else:
            unmatched.append({"field": "incidentCommunication", "value": comm})
    components = [
        _component("incident_plan_testing", "Incident Response Plan Testing", plan_pts, 12),
        _component("incident_automation", "Incident Response Automation", auto_pts, 10),
        _component("incident_communication", "Incident Communication", comm_pts, 8),
    ]
    return {
        "plan_points": plan_pts,
        "automation_points": auto_pts,
        "communication_points": comm_pts,
        "unmatched": unmatched,
        "has_input": _has_input(cadence) or _has_input(rollback) or _has_input(comm),
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": plan_pts + auto_pts + comm_pts,
    }


def calc_deployment_maturity_score(p: LooseInput) -> dict[str, Any]:
    # Document 1 §6 — sole owner of deployment_scale. Product stage belongs to Timing.
    scale_map = {
        "enterprise_multi_tenant": 12,
        "enterprise_single_tenant": 10,
        "mid_market": 7,
        "small_business": 4,
        "pilot": 2,
    }
    iso_map = {"full_instance_isolation": 8, "schema_isolation": 6, "row_level_security": 4}
    unmatched: list[dict[str, Any]] = []
    scale_raw = p.get("deploymentScale")
    scale_pts = 0
    if _has_input(scale_raw):
        if scale_raw in scale_map:
            scale_pts = scale_map[scale_raw]
        else:
            unmatched.append({"field": "deploymentScale", "value": scale_raw})
    iso_raw = p.get("isolationMethod")
    multi_pts = 0
    if p.get("multiTenancySupport") and _has_input(iso_raw):
        if iso_raw in iso_map:
            multi_pts = iso_map[iso_raw]
        else:
            unmatched.append({"field": "isolationMethod", "value": iso_raw})
    # Production readiness is owned by the Timing multiplier, so it is not a line
    # item here — listing it would show a gap this group can never close.
    components = [
        _component("deployment_scale", "Deployment Scale", scale_pts, 12),
        _component("multi_tenancy", "Multi-tenancy & Data Isolation", multi_pts, 8),
    ]
    return {
        "scale_points": scale_pts,
        "multi_tenancy_points": multi_pts,
        "unmatched": unmatched,
        "has_input": _has_input(scale_raw) or bool(p.get("multiTenancySupport")),
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": scale_pts + multi_pts,
    }


def calc_stability_score(p: LooseInput) -> dict[str, Any]:
    current_year = datetime.now().year
    year_raw = p.get("yearFounded")
    age_pts = 0
    age = None
    year_present = False
    try:
        if year_raw not in (None, ""):
            year_present = True
            age = current_year - int(year_raw)
            age_map = [
                {"min": 10, "pts": 12},
                {"min": 5, "pts": 9},
                {"min": 3, "pts": 6},
                {"min": 1, "pts": 3},
                {"min": 0, "pts": 0},
            ]
            age_pts = next((e["pts"] for e in age_map if age >= e["min"]), 0)
    except (TypeError, ValueError):
        year_present = False

    fin_map = {
        "profitable_3_years": 10,
        "profitable_1_year": 7,
        "break_even": 5,
        "funded_runway_2_years": 4,
        "funded_runway_1_year": 2,
        "uncertain": 0,
    }
    unmatched: list[dict[str, Any]] = []
    financial_raw = p.get("financialStatus")
    fin_pts = 0
    if _has_input(financial_raw):
        if financial_raw in fin_map:
            fin_pts = fin_map[financial_raw]
        else:
            unmatched.append({"field": "financialStatus", "value": financial_raw})

    rate = p.get("customerRetentionRate")
    retention_pts = 0
    retention_present = rate is not None and rate != ""
    if retention_present:
        try:
            rate_n = float(rate)
            if rate_n >= 95:
                retention_pts = 8
            elif rate_n >= 90:
                retention_pts = 6
            elif rate_n >= 80:
                retention_pts = 4
            elif rate_n >= 70:
                retention_pts = 2
            else:
                retention_pts = 0
        except (TypeError, ValueError):
            unmatched.append({"field": "customerRetentionRate", "value": rate})
            retention_present = False

    incident_pts = _incident_history_points(p)
    incidents_disclosed = _has_disclosed_incidents(p)
    components = [
        _component("company_age", "Company Longevity", age_pts, 12),
        _component("financial_health", "Financial Health", fin_pts, 10),
        _component("customer_retention", "Customer Retention Rate", retention_pts, 8),
    ]
    # Silence about incidents is neither credited nor penalised; a disclosed
    # history is scored against a clean record.
    if incidents_disclosed:
        components.append(
            _component("incident_history", "Disclosed Incident History", 6 + incident_pts, 6)
        )
    value = _roll_up(components)[0]
    return {
        "company_age_years": age,
        "company_age_points": age_pts,
        "financial_health_points": fin_pts,
        "customer_retention_points": retention_pts,
        "incident_history_points": incident_pts,
        "unmatched": unmatched,
        "has_input": year_present or _has_input(financial_raw) or retention_present or incidents_disclosed,
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": _pf(value),
    }


def _has_disclosed_incidents(p: LooseInput) -> bool:
    rows = p.get("disclosedIncidents")
    if rows is None:
        rows = p.get("security_incident_history")
    return isinstance(rows, list) and bool(rows)


def _incident_history_points(p: LooseInput) -> int:
    """Document 1 §6 — disclosed incidents deduct; resolved incidents are halved. Floor at 0 is applied by caller."""
    rows = p.get("disclosedIncidents")
    if rows is None:
        rows = p.get("security_incident_history")
    if not isinstance(rows, list) or not rows:
        return 0
    severity_pts = {"critical": -6, "high": -3, "medium": -1, "low": 0}
    total = 0.0
    for row in rows:
        if not isinstance(row, dict):
            continue
        sev = str(row.get("severity") or "").strip().lower()
        pts = float(severity_pts.get(sev, 0))
        resolved = bool(row.get("resolved") or row.get("disclosed_and_resolved"))
        if resolved:
            pts *= 0.5
        total += pts
    return int(total) if total == int(total) else round(total)


def calc_support_score(p: LooseInput) -> dict[str, Any]:
    tier_map = {
        "24_7_phone_chat_email": 10,
        "business_hours_phone_chat": 7,
        "business_hours_email": 4,
        "email_only": 2,
    }
    tam_map = {"dedicated_tam": 5, "shared_tam": 3, "standard_support": 1}
    unmatched: list[dict[str, Any]] = []
    tier_raw = p.get("supportTiers")
    tier_pts = 0
    if _has_input(tier_raw):
        if tier_raw in tier_map:
            tier_pts = tier_map[tier_raw]
        else:
            unmatched.append({"field": "supportTiers", "value": tier_raw})
    tam_raw = p.get("technicalAccountManager")
    tam_pts = 0
    if _has_input(tam_raw):
        if tam_raw in tam_map:
            tam_pts = tam_map[tam_raw]
        else:
            unmatched.append({"field": "technicalAccountManager", "value": tam_raw})
    coverage_pts = 5 if p.get("supportsHipaaWorkflows") else 0
    # Healthcare workflow support is only attainable for vendors selling into
    # healthcare; everyone else must not carry a gap they cannot close.
    healthcare_applicable = bool(
        p.get("healthcareWorkflowsApplicable") or p.get("supportsHipaaWorkflows")
    )
    components = [
        _component("support_tier", "Support Tier", tier_pts, 10),
        _component("technical_account_management", "Technical Account Management", tam_pts, 5),
    ]
    if healthcare_applicable:
        components.append(
            _component("healthcare_workflows", "Healthcare Workflow Support", coverage_pts, 5)
        )
    return {
        "support_tier_points": tier_pts,
        "coverage_points": coverage_pts,
        "expertise_points": tam_pts,
        "unmatched": unmatched,
        "has_input": _has_input(tier_raw) or _has_input(tam_raw) or healthcare_applicable,
        "components": components,
        "attainable": _roll_up(components)[1],
        "value": tier_pts + coverage_pts + tam_pts,
    }


def calculate_operational_risk(p: LooseInput) -> dict[str, Any]:
    sla = calc_sla_score(p)
    incident = calc_incident_management_score(p)
    deployment = calc_deployment_maturity_score(p)
    stability = calc_stability_score(p)
    support = calc_support_score(p)
    pillar = _normalise_pillar(
        [
            ("sla_score", sla, bool(sla.get("has_input"))),
            ("incident_management_score", incident, bool(incident.get("has_input"))),
            ("deployment_maturity_score", deployment, bool(deployment.get("has_input"))),
            ("stability_score", stability, bool(stability.get("has_input"))),
            ("support_score", support, bool(support.get("has_input"))),
        ],
        OPERATIONAL_GROUP_LABELS,
    )
    unmatched = []
    for block in (sla, incident, deployment, stability, support):
        unmatched.extend(block.get("unmatched") or [])
    return {
        "sla_score": sla,
        "incident_management_score": incident,
        "deployment_maturity_score": deployment,
        "stability_score": stability,
        "support_score": support,
        "earned": pillar["earned"],
        "attainable": pillar["attainable"],
        "included_groups": pillar["included_groups"],
        "excluded_groups": pillar["excluded_groups"],
        "components": pillar["components"],
        "unmatched": unmatched,
        "not_implemented": pillar["not_implemented"],
        "calibration_version": CALIBRATION_VERSION,
        "value": pillar["value"] if pillar["value"] is not None else 0.0,
        "pillar": pillar,
    }


def interpret_trust_score(vts: float) -> dict[str, str]:
    s = max(0, min(100, round(float(vts))))
    if s >= 90:
        return {
            "grade": "A",
            "classification": "Exceptional Vendor",
            "recommended_action": "Fast-track procurement; minimal additional due diligence",
            "vendor_profile": "Market leader; comprehensive controls; proven track record",
        }
    if s >= 80:
        return {
            "grade": "B",
            "classification": "Trusted Vendor",
            "recommended_action": "Standard procurement process; focus on use-case fit",
            "vendor_profile": "Strong capabilities; mature governance; reliable operations",
        }
    if s >= 70:
        return {
            "grade": "C",
            "classification": "Acceptable Vendor",
            "recommended_action": "Enhanced due diligence; require mitigation roadmap",
            "vendor_profile": "Moderate capabilities; some gaps; growing operations",
        }
    if s >= 60:
        return {
            "grade": "D",
            "classification": "Review Recommended",
            "recommended_action": "Extensive validation; consider alternatives; pilot only",
            "vendor_profile": "Significant gaps; immature processes; limited track record",
        }
    return {
        "grade": "F",
        "classification": "Review Required",
        "recommended_action": "Reject; only consider for low-stakes non-production use",
        "vendor_profile": "Critical deficiencies; unproven capabilities; high risk ",
    }


def _build_factor_ledger(
    pillars: list[tuple[str, dict[str, Any], float]],
) -> list[dict[str, Any]]:
    """Every line item with the points its gap actually costs.

    category_impact = (gap / pillar_attainable) × 100, which sums over a pillar to
    (100 − category score). score_impact applies the pillar weight, so it sums to
    that pillar's deduction from the VTS. Between them the published breakdown
    reconciles with both the category score and the headline number.
    """
    ledger: list[dict[str, Any]] = []
    for category, pillar_result, weight in pillars:
        attainable = float(pillar_result.get("attainable") or 0)
        if attainable <= 0 or weight <= 0:
            continue
        for row in pillar_result.get("components") or []:
            gap = float(row["attainable"]) - float(row["earned"])
            category_impact = 100.0 * gap / attainable
            ledger.append({
                "category": category,
                "group": row.get("group"),
                "group_label": row.get("group_label"),
                "key": row["key"],
                "label": row["label"],
                "earned": row["earned"],
                "attainable": row["attainable"],
                "weight": weight,
                "category_impact": _pf(category_impact),
                "score_impact": _pf(category_impact * weight),
            })
    return ledger


def calculate_vendor_trust_score(user_input: LooseInput) -> dict[str, Any]:
    l_scores = user_input.get("likelihoodScores") or []
    i_scores = user_input.get("impactScores") or []
    # No Risk Intellect scores means no measured product risk. The pillar is
    # excluded and its weight redistributed rather than scored off a stub.
    product_measured = bool(l_scores) and bool(i_scores)
    l_result = calculate_likelihood(l_scores) if product_measured else {
        "value": 0.0,
        "riskCount": 0,
        "source": "insufficient_evidence",
    }
    i_result = calculate_impact(i_scores) if product_measured else {
        "value": 0.0,
        "riskCount": 0,
        "source": "insufficient_evidence",
    }
    severity_raw = user_input.get("severityScores") or []
    if severity_raw:
        s_result = calculate_severity(severity_raw)
        s_result["source"] = user_input.get("severity_score_source") or "payload"
    elif product_measured:
        s_result = {
            "value": _pf(l_result["value"] * i_result["value"]),
            "riskCount": l_result["riskCount"],
            "derived": True,
            "source": "likelihood_x_impact",
        }
    else:
        s_result = {
            "value": 0.0,
            "riskCount": 0,
            "derived": False,
            "source": "insufficient_evidence",
        }
    if user_input.get("likelihood_score_source"):
        l_result = {**l_result, "source": user_input.get("likelihood_score_source")}
    if user_input.get("impact_score_source"):
        i_result = {**i_result, "source": user_input.get("impact_score_source")}
    print(
        "[type-01 VTS] likelihood/impact calculation",
        {
            "formula": "L = sum(likelihoodScores)/n, I = sum(impactScores)/n, base_risk = L × I",
            "likelihood_score_source": user_input.get("likelihood_score_source") or "default",
            "impact_score_source": user_input.get("impact_score_source") or "default",
            "likelihoodScores": l_scores,
            "impactScores": i_scores,
            "L": l_result,
            "I": i_result,
            "severityScores": severity_raw,
            "S": s_result,
            "base_risk_LxI": _pf(l_result["value"] * i_result["value"]),
        },
    )
    cm_result = calculate_combined_contextual_multiplier(user_input)
    domains = user_input.get("applicableDomains") or []
    if not domains:
        dw_result = {
            "breakdown": [],
            "weighted_sum": 0.0,
            "total_risks": 0,
            "value": DEFAULT_DOMAIN_WEIGHT,
            "source": "default_no_applicable_domains",
        }
    else:
        dw_result = calculate_domain_weight(domains)
    sm_result = calculate_sector_modifier(user_input)
    ir_result = calculate_inherent_risk(
        L=l_result["value"],
        I=i_result["value"],
        CM=cm_result["value"],
        DW=dw_result["value"],
        SM=sm_result["value"],
    )
    me_result = calculate_mitigation_effectiveness(user_input)
    cf_result = calculate_confidence_factor(user_input)
    pr_result = calculate_product_risk(
        inherent_risk=ir_result["value"],
        mitigation_effectiveness=me_result["value"],
        confidence_factor=cf_result["value"],
    )
    gr_result = calculate_governance_risk(user_input)
    or_result = calculate_operational_risk(user_input)

    # Document 1 §3 declares fixed pillar weights. Missing groups are handled
    # inside their pillar denominator. A pillar with nothing measured at all is
    # dropped and its weight shared out, so no pillar is scored off a stub.
    active = {
        "product": product_measured,
        "governance": not gr_result.get("not_implemented"),
        "operational": not or_result.get("not_implemented"),
    }
    weights = _redistribute_pillar_weights(active)
    pr_w = weights["product"]
    gr_w = weights["governance"]
    or_w = weights["operational"]
    pr_val = float(pr_result["value"] or 0) if product_measured else 0.0
    gr_val = float(gr_result["value"] or 0)
    or_val = float(or_result["value"] or 0)
    weighted_risk = (pr_val * pr_w) + (gr_val * gr_w) + (or_val * or_w)
    vts = _pf(max(0.0, min(100.0, 100 - weighted_risk)), 2)
    interpretation = interpret_trust_score(vts)

    unmatched: list[dict[str, Any]] = []
    for block in (
        cm_result.get("entity_type_multiplier"),
        cm_result.get("timing_multiplier"),
        cm_result.get("architecture_multiplier"),
        cm_result.get("scale_multiplier"),
        cf_result,
        gr_result,
        or_result,
    ):
        if isinstance(block, dict):
            unmatched.extend(block.get("unmatched") or [])

    factor_ledger = _build_factor_ledger(
        [
            ("Governance", gr_result, gr_w),
            ("Operational", or_result, or_w),
        ]
    )
    if product_measured:
        factor_ledger.append({
            "category": "Product",
            "group": "product_risk",
            "group_label": "AI Product Risk",
            "key": "product_risk",
            "label": "AI Product Risk Profile",
            "earned": _pf(max(0.0, 100.0 - pr_val)),
            "attainable": 100.0,
            "weight": pr_w,
            "category_impact": _pf(pr_val),
            "score_impact": _pf(pr_val * pr_w),
        })

    detail: dict[str, Any] = {
        "product_risk": {
            "likelihood": l_result,
            "impact": i_result,
            "severity": s_result,
            "combined_contextual_multiplier": cm_result,
            "domain_weight": dw_result,
            "sector_modifier": sm_result,
            "inherent_risk": ir_result,
            "mitigation_effectiveness": me_result,
            "confidence_factor": cf_result,
            "product_risk": pr_result,
        },
        "governance_risk": gr_result,
        "operational_risk": or_result,
        "final_formula": {
            "expression": "VTS = 100 - [(PR × w_product) + (GR × w_governance) + (OR × w_operational)]",
            "pillar_weights": weights,
            "pillars_measured": active,
            "product_risk_contribution": _pf(pr_val * pr_w),
            "governance_risk_contribution": _pf(gr_val * gr_w),
            "operational_risk_contribution": _pf(or_val * or_w),
        },
        "factor_ledger": factor_ledger,
        "score_trace": {
            "registry_version": SCORING_VERSION,
            "calibration_version": CALIBRATION_VERSION,
            "unmatched_markers": unmatched,
            "excluded_groups": {
                "governance": gr_result.get("excluded_groups") or [],
                "operational": or_result.get("excluded_groups") or [],
            },
        },
    }
    coverage_meta = user_input.get("_categoryCoverageMeta")
    if isinstance(coverage_meta, dict) and coverage_meta:
        detail["category_coverage_resolution"] = coverage_meta

    return {
        "vendor_trust_score": vts,
        "product_risk": pr_result["value"],
        "governance_risk": gr_result["value"],
        "operational_risk": or_result["value"],
        "weighted_risk": _pf(weighted_risk),
        "grade": interpretation["grade"],
        "classification": interpretation["classification"],
        "recommended_action": interpretation["recommended_action"],
        "detail": detail,
        "scoring_version": SCORING_VERSION,
        "calibration_version": CALIBRATION_VERSION,
    }


def band_employee_count(raw: Any) -> str | None:
    """Map stored employee-count labels (commas, en-dashes) onto VTS size bands."""
    compact = re.sub(r"[,\s]", "", str(raw or ""))
    compact = compact.replace("–", "-").replace("—", "-").replace("−", "-")
    nums = [int(n) for n in re.findall(r"\d+", compact)]
    if not nums:
        return None
    lo = min(nums)
    if "+" in compact and lo >= 10000:
        return "10000+"
    if lo >= 10000:
        return "10000+"
    if lo >= 5001:
        return "5001-10000"
    if lo >= 1001:
        return "1001-5000"
    if lo >= 201:
        return "201-1000"
    if lo >= 51:
        return "51-200"
    if lo >= 11:
        return "11-50"
    return "1-10"


def band_geographic_regions(regions: Any) -> str | None:
    """Band by Global semantics first, then by enumerated region count."""
    if isinstance(regions, str):
        items = [regions] if regions.strip() else []
    elif isinstance(regions, list):
        items = [str(x).strip() for x in regions if str(x or "").strip()]
    else:
        items = []
    if any("global" in x.lower() for x in items):
        return "global"
    region_count = len(items)
    if region_count == 0:
        return None
    if region_count >= 5:
        return "global"
    if region_count >= 3:
        return "multi_national"
    if region_count == 2:
        return "national"
    return "regional"


def derive_applicable_domains(payload: LooseInput, formula: LooseInput) -> list[dict[str, Any]]:
    """Document 1 §4.3 — applicability from product exposure, not from vendor controls."""
    supplied = formula.get("applicableDomains") if isinstance(formula.get("applicableDomains"), list) else None
    if not supplied:
        supplied = payload.get("applicableDomains") if isinstance(payload.get("applicableDomains"), list) else None
    if supplied:
        out = []
        for row in supplied:
            if not isinstance(row, dict):
                continue
            domain = row.get("domain")
            if not domain:
                continue
            try:
                count = int(row.get("riskCount") or 0)
            except (TypeError, ValueError):
                count = 0
            out.append({"domain": domain, "riskCount": max(count, 1)})
        if out:
            return out

    caps = " ".join(
        str(x or "").lower()
        for x in (
            payload.get("ai_capabilities"),
            payload.get("model_types"),
            payload.get("product_description"),
            formula.get("aiCapabilityType"),
        )
    )
    generative = any(tok in caps for tok in ("generat", "llm", "gpt", "image", "text-to", "diffusion"))
    public_facing = any(tok in caps for tok in ("public", "customer-facing", "end user", "chat"))
    pii = str(formula.get("piiHandling") or "").lower()
    autonomy = str(formula.get("decisionAutonomyLevel") or "")
    scale = str(formula.get("deploymentScale") or "")
    volume = str(formula.get("dataVolumeScale") or "")
    residency = payload.get("data_residency_options")

    domains: list[dict[str, Any]] = []

    def add(name: str) -> None:
        if not any(d["domain"] == name for d in domains):
            domains.append({"domain": name, "riskCount": 1})

    if generative or public_facing:
        add("Malicious Actors and Misuse")
    if pii not in ("", "none", "no", "not_applicable") or _has_input(residency):
        add("Privacy and Security")
    if autonomy in ("supervised", "autonomous", "fully_autonomous"):
        add("AI System Safety, Failures and Limitations")
    if any(tok in caps for tok in ("decision", "hiring", "credit", "people", "hr")) or autonomy in (
        "supervised",
        "autonomous",
        "fully_autonomous",
    ):
        add("Discrimination and Toxicity")
    if generative:
        add("Misinformation")
    if autonomy in ("autonomous", "fully_autonomous"):
        add("Human-Computer Interaction")
    if scale.startswith("enterprise") or volume == "petabyte_scale":
        add("Socioeconomic and Environmental")
    return domains


def build_formula_input_from_payload(payload: dict[str, Any]) -> LooseInput:
    cp = payload.get("companyProfile") if isinstance(payload.get("companyProfile"), dict) else {}

    def get(k: str) -> Any:
        return payload[k] if k in payload and payload[k] is not None else cp.get(k)

    def as_str(v: Any) -> str:
        return str(v or "").strip()

    def lower(v: Any) -> str:
        return as_str(v).lower()

    def to_num(v: Any, fallback: float) -> float:
        try:
            n = float(v)
            return n if n == n else fallback  # NaN check
        except (TypeError, ValueError):
            return fallback

    employee_raw = get("employeeCount") if get("employeeCount") is not None else get("no_of_employees")
    year_raw = get("yearFounded") if get("yearFounded") is not None else get("year_founded")
    year_founded = None
    if year_raw not in (None, ""):
        year_founded = int(max(1990, min(datetime.now().year, to_num(year_raw, datetime.now().year))))
    regions = get("operatingRegions")
    if regions is None:
        regions = get("operate_regions")

    # Autonomy and stake each come from their own answer; sharing one text blob let an
    # unrelated answer containing "critical" or "autonomous" set the multiplier.
    autonomy_answer = get("decision_autonomy") if get("decision_autonomy") is not None else get("ai_autonomy_level")
    decision_autonomy_level = answers.decision_autonomy_level(autonomy_answer)
    pii_answer = get("pii_handling") if get("pii_handling") is not None else get("pii_information")
    decision_stake_level = answers.lookup(answers.PII_STAKE_LEVEL, pii_answer, "")
    pii_handling = answers.lookup(answers.PII_HANDLING, pii_answer, "")

    stage_answer = get("product_stage") if get("product_stage") is not None else get("stage_product")
    dev_stage = answers.lookup(answers.PRODUCT_STAGE, stage_answer, "")

    # "No" is an answer, not an absent one — presence of text is not evidence of a policy.
    retention_answer = get("data_retention_policy")
    data_retention_policy = bool(answers.yes_no(retention_answer, default=False))
    incident_response_plan_maturity, ir_plan_testing = answers.reconcile_ir_plan(
        get("incident_response_plan"), get("ir_plan_test_frequency")
    )
    pen_test_report_available, pen_test_cadence = answers.reconcile_pen_testing(
        get("adversarial_security_testing"), get("independent_pen_test_frequency")
    )
    privacy_programme_scope = answers.passthrough(
        get("privacy_programme_scope"), {"comprehensive_gdpr_ccpa", "standard", "basic"}, ""
    )

    host_src = get("hosting_deployment") if get("hosting_deployment") is not None else get("solution_hosted")
    if isinstance(host_src, list):
        hosting_type: Any = []
        for item in host_src:
            raw = str(item or "").strip().lower()
            if "edge" in raw:
                hosting_type.append("edge_devices")
            elif "hybrid" in raw:
                hosting_type.append("hybrid")
            elif "prem" in raw:
                hosting_type.append("on_premise")
            elif raw:
                hosting_type.append("cloud_hosted")
        if not hosting_type:
            hosting_type = "cloud_hosted"
    else:
        host_raw = lower(host_src)
        if "edge" in host_raw:
            hosting_type = "edge_devices"
        elif "hybrid" in host_raw:
            hosting_type = "hybrid"
        elif "prem" in host_raw:
            hosting_type = "on_premise"
        elif host_raw:
            hosting_type = "cloud_hosted"
        else:
            hosting_type = None

    employee_count = band_employee_count(employee_raw)
    geographic_regions = band_geographic_regions(regions)

    compliance_upload_names = collect_compliance_upload_file_names(payload)
    compliance_upload_blob = " ".join(compliance_upload_names).lower()
    cert_form_blob = certification_form_text_from_getter(get).lower()
    certifications_search_blob = f"{cert_form_blob} {compliance_upload_blob}".strip()
    sector_raw = get("sector") if get("sector") is not None else get("target_industries")
    vts_sector = answers.vts_sector_from_value(sector_raw)
    healthcare_context = (
        "health" in vts_sector.lower()
        or "health" in " ".join(answers.flatten_sector_labels(sector_raw)).lower()
    )
    buyer_industry_segment = normalize_cert_industry_segment_input(
        as_str(
            get("buyerIndustrySegment")
            or get("buyer_industry_segment")
            or get("industrySegment")
            or get("industry_segment")
            or get("buyerSegment")
            or answers.first_industry_segment(sector_raw)
            or ""
        )
    )

    # Category_Coverage: attestation answers + vector document evidence (no hardcoded 4/6)
    use_vector = payload.get("_skipCategoryVector") is not True
    coverage_inputs = resolve_category_coverage_inputs(payload, use_vector=use_vector)

    # Likelihood / impact / severity: prefer AI Risk Intellect values injected by Node.
    likelihood_supplied = get("likelihoodScores") if get("likelihoodScores") is not None else payload.get("likelihoodScores")
    impact_supplied = get("impactScores") if get("impactScores") is not None else payload.get("impactScores")
    likelihood_scores = _score_list(likelihood_supplied, lo=1.0, hi=5.0)
    impact_scores = _score_list(impact_supplied, lo=1.0, hi=5.0)
    severity_scores = _score_list(
        get("severityScores") if get("severityScores") is not None else payload.get("severityScores"),
        lo=1.0,
        hi=25.0,
    )

    intentional_raw = (
        get("intentionalRiskCount")
        if get("intentionalRiskCount") is not None
        else payload.get("intentionalRiskCount")
    )
    unintentional_raw = (
        get("unintentionalRiskCount")
        if get("unintentionalRiskCount") is not None
        else payload.get("unintentionalRiskCount")
    )
    try:
        intentional_count = int(intentional_raw) if intentional_raw not in (None, "") else 0
    except (TypeError, ValueError):
        intentional_count = 0
    try:
        unintentional_count = int(unintentional_raw) if unintentional_raw not in (None, "") else 0
    except (TypeError, ValueError):
        unintentional_count = 0
    if intentional_count < 0:
        intentional_count = 0
    if unintentional_count < 0:
        unintentional_count = 0

    formula_input: LooseInput = {
        "likelihoodScores": likelihood_scores,
        "impactScores": impact_scores,
        "severityScores": severity_scores,
        "likelihood_score_source": as_str(
            get("likelihood_score_source") or payload.get("likelihood_score_source")
        )
        or ("payload" if _has_input(likelihood_supplied) else "insufficient_evidence_pending_prior"),
        "impact_score_source": as_str(
            get("impact_score_source") or payload.get("impact_score_source")
        )
        or ("payload" if _has_input(impact_supplied) else "insufficient_evidence_pending_prior"),
        "severity_score_source": as_str(
            get("severity_score_source") or payload.get("severity_score_source")
        )
        or "default",
        "decisionAutonomyLevel": decision_autonomy_level,
        "decisionStakeLevel": decision_stake_level,
        "devStage": dev_stage,
        "assessmentPhase": "vendor_evaluation",
        "customizationLevel": answers.lookup(
            answers.DEPLOYMENT_CUSTOMIZATION, get("deployment_customization"), ""
        ) or None,
        "integrationComplexity": answers.lookup(
            answers.INTEGRATION_COMPLEXITY, get("integration_complexity"), ""
        ) or None,
        "hostingType": hosting_type,
        "employeeCount": employee_count,
        "geographicRegions": geographic_regions,
        "dataVolumeScale": answers.passthrough(
            get("typical_data_volume"),
            {"minimal", "moderate", "large", "very_large", "petabyte_scale"},
            "",
        ) or None,
        "intentionalRiskCount": intentional_count,
        "unintentionalRiskCount": unintentional_count,
        "sector": vts_sector,
        "aiCapabilityType": None,
        "piiHandling": pii_handling,
        "regulatoryComplexity": [],
        "deploymentScale": answers.lookup(
            answers.DEPLOYMENT_SCALE, get("deployment_scale"), ""
        ) or None,
        "patientDemographic": None,
        "requiredCategories": [
            c for c in (coverage_inputs["requiredCategories"] or [])
            if c not in EXCLUDED_MITIGATION_CATEGORIES
        ],
        "implementedCategories": [
            c for c in (coverage_inputs["implementedCategories"] or [])
            if c not in EXCLUDED_MITIGATION_CATEGORIES
        ],
        "mitigations": list(coverage_inputs["mitigations"]),
        "_categoryCoverageMeta": coverage_inputs.get("meta") or {},
        "assessmentMethod": answers.lookup(
            answers.ASSESSMENT_METHOD,
            get("assessment_completion_level") if get("assessment_completion_level") is not None
            else get("assessment_feedback"),
            "",
        ) or None,
        "complianceDocumentationComplete": bool(compliance_upload_names),
        "trustCenterUrl": as_str(
            get("trustCenterUrl") if get("trustCenterUrl") is not None else get("trust_center_url")
        ),
        "testingResultsAvailable": as_str(
            get("testing_results_available") if get("testing_results_available") is not None else get("test_results")
        ),
        "certificates": get("certificates") if isinstance(get("certificates"), list) else (
            payload.get("certificates") if isinstance(payload.get("certificates"), list) else []
        ),
        "disclosedIncidents": (
            get("disclosedIncidents") if isinstance(get("disclosedIncidents"), list)
            else get("security_incident_history") if isinstance(get("security_incident_history"), list)
            else []
        ),
        "encryptionAtRest": as_str(get("encryption_at_rest")),
        "encryptionAtRestEvidenceId": as_str(get("encryption_at_rest_evidence_id")),
        "tlsInTransit": as_str(get("tls_in_transit")),
        "dataSubjectRights": get("data_subject_rights") if isinstance(get("data_subject_rights"), list) else [],
        "controllerOrProcessor": as_str(get("controller_or_processor")),
        "subProcessors": get("sub_processors") if isinstance(get("sub_processors"), list) else [],
        "vulnerabilityDisclosurePolicy": (
            get("vulnerability_disclosure_policy")
            if isinstance(get("vulnerability_disclosure_policy"), dict)
            else {}
        ),
        "bugBounty": get("bug_bounty") if isinstance(get("bug_bounty"), dict) else {},
        "independentPenTestFrequency": pen_test_cadence,
        "dpaAvailable": as_str(get("dpa_available")),
        "penetrationTestReportAvailable": pen_test_report_available,
        "soc2Type2Current": bool(
            re.search(r"\bsoc\s*2\b|soc2", certifications_search_blob, re.I)
            and re.search(r"type\s*2|type\s*ii|type2", certifications_search_blob, re.I)
        ),
        "soc2Certification": (
            "Type 2 (current)"
            if re.search(r"type\s*2|type\s*ii|type2", certifications_search_blob, re.I)
            else "None"
        ),
        "isoCertifications": (
            "ISO 27001 only"
            if re.search(r"\biso\s*27001\b|27001", certifications_search_blob, re.I)
            else "None"
        ),
        "hipaaCertification": (
            "HIPAA BAA + HITRUST"
            if re.search(r"hipaa", certifications_search_blob, re.I)
            and re.search(r"hitrust", certifications_search_blob, re.I)
            else (
                "HIPAA BAA only"
                if re.search(r"hipaa|\bbaa\b", certifications_search_blob, re.I)
                else "None"
            )
        ),
        "certificationsSearchBlob": certifications_search_blob,
        "complianceUploadBlob": compliance_upload_blob,
        "buyerIndustrySegment": buyer_industry_segment,
        "yearFounded": year_founded,
        "fundingStatus": answers.passthrough(
            get("fundingStatus") if get("fundingStatus") is not None else get("funding_status"),
            {
                "publicly_traded",
                "series_d_plus",
                "series_b_c",
                "series_a",
                "seed_angel",
                "bootstrapped",
            },
            "",
        ) or None,
        "revenueSufficient": answers.yes_no(get("revenueSufficient") if get("revenueSufficient") is not None else get("revenue_sufficient"), default=False),
        "enterpriseCustomers": answers.number(
            get("enterpriseCustomers") if get("enterpriseCustomers") is not None
            else get("enterprise_customers"),
            0,
        ),
        "auditFrequency": answers.lookup(
            answers.AUDIT_FREQUENCY, get("audit_frequency"), ""
        ) or None,
        "dataRetentionPolicy": data_retention_policy if retention_answer not in (None, "") else None,
        "dataRetentionPolicyCompleteness": (
            "documented_and_enforced" if data_retention_policy else None
        ),
        "incidentResponsePlan": None if get("incident_response_plan") in (None, "") else (
            incident_response_plan_maturity is not None
        ),
        "incidentResponsePlanMaturity": incident_response_plan_maturity,
        "privacyPolicy": bool(privacy_programme_scope) if privacy_programme_scope else None,
        "privacyPolicyScope": privacy_programme_scope or None,
        "aiEthicsPolicy": (
            None if get("documented_ai_governance_policy") in (None, "")
            else answers.yes_no(get("documented_ai_governance_policy"), default=False)
        ),
        "aiEthicsMaturity": answers.passthrough(
            get("ai_ethics_governance_maturity"),
            {"board_approved_operationalized", "documented_not_operationalized", "draft"},
            "",
        ) or None,
        "rollbackProcedures": answers.lookup(
            answers.ROLLBACK_CAPABILITY,
            get("rollback_capability") if get("rollback_capability") is not None
            else get("rollback_deployment_issues"),
            "",
        ) or None,
        "humanOversightCapabilities": answers.strongest_human_oversight(get("human_oversight")),
        "continuousMonitoring": answers.passthrough(
            get("production_model_monitoring"),
            {"real_time_alerting", "daily_dashboard", "weekly_reports", "monthly_reviews", "none"},
            "",
        ) or None,
        "modelVersionControl": (
            None if get("versions_models") in (None, "")
            else answers.yes_no(get("versions_models"), default=False)
        ),
        "versioningMaturity": answers.passthrough(
            get("model_versioning_method"),
            {"automated_mlops_pipeline", "manual_documented", "basic_tracking"},
            "",
        ) or None,
        "slaUptime": answers.lookup(
            answers.UPTIME_SLA,
            get("uptime_sla") if get("uptime_sla") is not None else get("sla_guarantee"),
            "",
        ) or None,
        "criticalIncidentResponse": as_str(get("critical_incident_response_target")),
        "criticalIncidentResolution": as_str(get("critical_incident_resolution_target")),
        "planTesting": ir_plan_testing,
        "incidentCommunication": answers.passthrough(
            get("incident_customer_communication"),
            {"proactive_status_page", "email_notifications", "reactive_only", "none"},
            "",
        ) or None,
        "multiTenancySupport": (
            None if get("is_multi_tenant") in (None, "")
            else answers.yes_no(get("is_multi_tenant"), default=False)
        ),
        "isolationMethod": answers.passthrough(
            get("tenant_isolation_model"),
            {"full_instance_isolation", "schema_isolation", "row_level_security"},
            "",
        ) or None,
        "financialStatus": answers.passthrough(
            get("financialPosition") if get("financialPosition") is not None
            else get("financial_position"),
            {
                "profitable_3_years",
                "profitable_1_year",
                "break_even",
                "funded_runway_2_years",
                "funded_runway_1_year",
                "uncertain",
            },
            "",
        ) or None,
        "customerRetentionRate": answers.number(
            get("customerRetentionRate") if get("customerRetentionRate") is not None
            else get("customer_retention_rate")
        ),
        "supportTiers": answers.passthrough(
            get("support_coverage"),
            {
                "24_7_phone_chat_email",
                "business_hours_phone_chat",
                "business_hours_email",
                "email_only",
            },
            "",
        ) or None,
        "healthcareWorkflowsApplicable": healthcare_context,
        "supportsHipaaWorkflows": bool(
            healthcare_context
            and re.search(r"\bhipaa\b|\bhitrust\b|\bbaa\b", certifications_search_blob, re.I)
        ),
        "technicalAccountManager": answers.passthrough(
            get("account_management"),
            {"dedicated_tam", "shared_tam", "standard_support"},
            "",
        ) or None,
    }
    formula_input["applicableDomains"] = derive_applicable_domains(payload, formula_input)
    return formula_input


def score_attestation_payload(payload: dict[str, Any]) -> dict[str, Any]:
    formula_input = build_formula_input_from_payload(payload)
    return calculate_vendor_trust_score(formula_input)