"""Sales Confidence Score (Type 2) — Documents 0 and 2.

SCS = 100 − [ CFR × 0.35 + IR × 0.35 + CR × 0.30 ]
CFR / IR use Document 0 pillar normalisation (absent groups drop out).
AIRI §7 is not applied: no drift, no C-3 live share, no V-7 competitor records.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

SCORING_VERSION = "scs-2.0"
CALIBRATION_VERSION = "scs-2.0-cal-2026-09-09"

PILLAR_WEIGHTS = {
    "customer_friction": 0.35,
    "implementation": 0.35,
    "competitive": 0.30,
}

# Document 2 declared ranges — used as attainable maxima when the group has input.
CFR_ATTAINABLE: dict[str, float] = {
    "regulatory_complexity": 70,
    "data_sensitivity_friction": 60,
    "risk_tolerance_friction": 45,
    "customer_specific_risk_friction": 60,
    "trust_gap_friction": 40,
    "sector_risk_climate": 5,
}
IR_ATTAINABLE: dict[str, float] = {
    "integration_complexity": 60,
    "customization_required": 64,
    "timeline_pressure": 30,
    "control_coverage_gap": 40,
}

# Document 4 configuration value 5 — flat default until industry/posture table is filled.
DEFAULT_REQUIRED_VTS = 85.0
REQUIRED_VTS_TABLE: dict[tuple[str, str], float] = {}

REGULATED_INDUSTRY_GROUPS = frozenset(
    {"Healthcare", "Financial_Services", "Government"}
)


def _pf(value: float, digits: int = 4) -> float:
    return float(f"{value:.{digits}f}")


def _has_input(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, str) and not value.strip():
        return False
    if isinstance(value, (list, dict)) and len(value) == 0:
        return False
    return True


def _note_degraded(p: dict[str, Any], field: str) -> None:
    notes = p.setdefault("_degraded_fields", [])
    if isinstance(notes, list) and field not in notes:
        notes.append(field)


def _note_unmatched(p: dict[str, Any], field: str, raw: Any) -> None:
    markers = p.setdefault("_unmatched", [])
    if isinstance(markers, list):
        markers.append({"field": field, "value": raw})
    _note_degraded(p, field)


def _lookup(
    p: dict[str, Any],
    key: str,
    mapping: dict[str, float],
    field: str,
) -> float | None:
    """Registry lookup. Missing → None (exclude). Unmatched → marker + None."""
    if key not in p or not _has_input(p.get(key)):
        return None
    value = p.get(key)
    if value in mapping:
        return mapping[value]
    _note_unmatched(p, field, value)
    return None


def _redistribute_pillar_weights(active: dict[str, bool]) -> dict[str, float]:
    live = {k: v for k, v in PILLAR_WEIGHTS.items() if active.get(k, True)}
    total = sum(live.values())
    if total <= 0:
        return {k: 0.0 for k in PILLAR_WEIGHTS}
    return {k: (live[k] / total if k in live else 0.0) for k in PILLAR_WEIGHTS}


def _normalise_risk_pillar(
    groups: list[tuple[str, dict[str, Any], bool]],
    attainable_map: dict[str, float],
) -> dict[str, Any]:
    """Document 2: Pillar_Risk = 100 × (earned / attainable). Absent groups drop out."""
    earned = 0.0
    attainable = 0.0
    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    leaves: dict[str, Any] = {}
    for name, result, has_input in groups:
        leaves[name] = result
        cap = attainable_map.get(name)
        if cap is None:
            excluded.append({"group": name, "reason": "excluded_until_measured"})
            continue
        if not has_input or result.get("not_implemented"):
            excluded.append({"group": name, "reason": result.get("exclude_reason") or "no_input"})
            continue
        pts = min(float(result.get("value") or 0), float(cap))
        earned += pts
        attainable += float(cap)
        included.append({"group": name, "earned": _pf(pts), "attainable": float(cap)})
    if attainable <= 0:
        out = {
            "earned": 0.0,
            "attainable": 0.0,
            "included_groups": included,
            "excluded_groups": excluded,
            "not_implemented": True,
            "value": None,
        }
        out.update(leaves)
        return out
    risk = 100.0 * (earned / attainable)
    clamped = max(0.0, min(100.0, risk))
    out = {
        "earned": _pf(earned),
        "attainable": float(attainable),
        "included_groups": included,
        "excluded_groups": excluded,
        "not_implemented": False,
        "raw_ratio": _pf(earned / attainable),
        "value": _pf(clamped),
    }
    out.update(leaves)
    return out


def _mapped(
    p: dict[str, Any],
    key: str,
    mapping: dict[str, float],
    default: float,
    field: str,
) -> float:
    """Back-compat wrapper used by leftover callers; prefers exclude-on-miss via _lookup."""
    found = _lookup(p, key, mapping, field)
    return default if found is None else found


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 – CUSTOMER FRICTION RISK
# ─────────────────────────────────────────────────────────────────────────────


def calc_regulatory_complexity(p: dict[str, Any]) -> dict[str, Any]:
    sector_multiplier_map: dict[str, float] = {
        "Healthcare": 6,
        "Financial_Services": 5,
        "Government": 5,
        "Autonomous_Systems": 7,
        "E_Commerce": 3,
        "Technology": 2,
        "Other": 3,
    }
    regs = p.get("customerRegulatoryRequirements")
    has_regs = isinstance(regs, list)
    if not has_regs and p.get("_has_regulatory") is False:
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
    if not has_regs and not _has_input(regs):
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}

    count = len(regs) if isinstance(regs, list) else 0
    sector = p.get("sector")
    if not _has_input(sector):
        multiplier = sector_multiplier_map["Other"]
    elif sector in sector_multiplier_map:
        multiplier = sector_multiplier_map[sector]
    else:
        _note_unmatched(p, "sector", sector)
        multiplier = sector_multiplier_map["Other"]
    value = min(70, count * multiplier)
    return {
        "has_input": True,
        "regulatory_requirement_count": count,
        "regulatory_requirements": regs if isinstance(regs, list) else [],
        "sector_complexity_multiplier": multiplier,
        "value": value,
    }


def calc_data_sensitivity_friction(p: dict[str, Any]) -> dict[str, Any]:
    sensitivity_map: dict[str, float] = {
        "Public": 5,
        "Internal": 10,
        "Sensitive": 20,
        "Highly_Sensitive": 25,
        "Extremely_Sensitive": 30,
        "Low (Public or anonymized)": 5,
        "Medium (Business confidential)": 10,
        "High (PHI, Financial data, PII)": 20,
        "Critical (Life-safety, National security)": 30,
    }
    base_points = _lookup(p, "customerDataSensitivity", sensitivity_map, "customerDataSensitivity")
    if base_points is None:
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}

    regs = p.get("customerRegulatoryRequirements")
    reg_count = len(regs) if isinstance(regs, list) else 0
    burden_rate = 3 if p.get("sector") in REGULATED_INDUSTRY_GROUPS else 2
    doc_burden = reg_count * burden_rate
    value = min(60, base_points + doc_burden)
    return {
        "has_input": True,
        "data_sensitivity_base_points": base_points,
        "regulatory_count": reg_count,
        "compliance_burden_rate": burden_rate,
        "compliance_documentation_burden": doc_burden,
        "value": value,
    }


def calc_risk_tolerance_friction(p: dict[str, Any]) -> dict[str, Any]:
    tolerance_map: dict[str, float] = {
        "Very_High": 0,
        "Aggressive": 3,
        "High": 3,
        "Moderate": 8,
        "Conservative": 15,
        "Low": 15,
        "Risk_averse": 20,
        "Very_Low": 20,
    }
    raw_tol = p.get("customerRiskTolerance")
    if isinstance(raw_tol, str) and "not known" in raw_tol.lower():
        return {"has_input": False, "value": 0, "exclude_reason": "not_known"}
    base = _lookup(p, "customerRiskTolerance", tolerance_map, "customerRiskTolerance")
    if base is None:
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}

    regs = p.get("customerRegulatoryRequirements")
    reg_count = len(regs) if isinstance(regs, list) else 0
    is_conservative = p.get("customerRiskTolerance") in (
        "Conservative",
        "Risk_averse",
        "Low",
        "Very_Low",
    )
    customer_specific_risk_count = int(p.get("customerSpecificRiskCount") or 0)
    proof_burden = (
        customer_specific_risk_count * 2 + reg_count
        if is_conservative
        else 0
    )

    review = 0
    certs = [
        str(x).lower()
        for x in (p.get("customerCertifications") or [])
        if str(x).strip()
    ]
    if any("soc 2" in c or "iso 27001" in c for c in certs):
        review += 3
    policy = str(p.get("customerPublicAiPolicy") or "").lower()
    if policy.startswith("yes"):
        review += 2
    leadership = str(p.get("customerAiLeadership") or "").lower()
    if "chief ai" in leadership or "chief data" in leadership:
        review += 2
    review = min(5, review)

    return {
        "has_input": True,
        "tolerance_base_points": base,
        "is_conservative_or_averse": is_conservative,
        "customer_specific_risk_count": customer_specific_risk_count,
        "regulatory_count": reg_count,
        "proof_requirement_burden": proof_burden,
        "formal_review_adjustment": review,
        "value": min(45, base + proof_burden + review),
    }


def calc_customer_specific_risk_friction(p: dict[str, Any]) -> dict[str, Any]:
    risk_weight_map: dict[str, float] = {
        "Enterprise": 12,
        "Mid_market": 10,
        "SMB": 7,
    }
    if p.get("_has_customer_specific_risks") is False and not _has_input(
        p.get("customerSpecificRiskCount")
    ):
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
    count = p.get("customerSpecificRiskCount")
    if count is None and not _has_input(p.get("uniqueRequirementsList")):
        if p.get("_has_customer_specific_risks") is not True:
            return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
        count = 0
    count = int(count or 0)
    risk_weight = _lookup(p, "customerType", risk_weight_map, "customerType")
    if risk_weight is None:
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}

    others = p.get("uniqueRequirementsList") or []
    other_selected = bool(p.get("customerHasUniqueRequirements")) or bool(others)
    unique_penalty = 5 if other_selected else 0
    value = min(60, count * risk_weight + unique_penalty)
    return {
        "has_input": True,
        "customer_specific_risk_count": count,
        "customer_type": p.get("customerType"),
        "risk_weight": risk_weight,
        "base_contribution": count * risk_weight,
        "has_unique_requirements": other_selected,
        "unique_requirements_list": others,
        "unique_requirement_penalty": unique_penalty,
        "value": value,
    }


def calc_trust_gap_friction(p: dict[str, Any]) -> dict[str, Any]:
    raw_vts = p.get("vendorTrustScore")
    if raw_vts is None:
        raw_vts = p.get("vendor_trust_score")
    try:
        vts = float(raw_vts) if raw_vts is not None and str(raw_vts).strip() != "" else None
    except (TypeError, ValueError):
        vts = None
    if vts is None:
        return {
            "has_input": False,
            "value": 0,
            "exclude_reason": "no_linked_attestation",
        }
    posture = str(p.get("customerRiskTolerance") or "").strip()
    industry = str(p.get("sector") or "").strip()
    required = REQUIRED_VTS_TABLE.get((industry, posture), DEFAULT_REQUIRED_VTS)
    gap = max(0.0, required - float(vts))
    gap = min(40.0, gap)
    return {
        "has_input": True,
        "vendor_trust_score": float(vts),
        "required_vts": required,
        "industry_group": industry,
        "risk_posture": posture,
        "value": _pf(gap),
    }


def calc_sector_risk_climate(p: dict[str, Any]) -> dict[str, Any]:
    """AIRI V-1/V-2 skipped; public-incident field alone (Document 2 §4.6)."""
    raw = p.get("customerPublicIncident")
    if not _has_input(raw):
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
    s = str(raw).lower()
    if "within 12" in s or "12 months" in s and "12-24" not in s and "12–24" not in s:
        adj = 5
    elif "12-24" in s or "12–24" in s:
        adj = 3
    elif "not known" in s:
        adj = 1
    else:
        adj = 0
    return {
        "has_input": True,
        "public_incident": raw,
        "airi_drift": 0,
        "public_incident_adjustment": adj,
        "value": min(20, adj),
        "note": "AIRI drift excluded until event-dated corpus is available",
    }


def calculate_customer_friction_risk(p: dict[str, Any]) -> dict[str, Any]:
    regulatory = calc_regulatory_complexity(p)
    data_sens = calc_data_sensitivity_friction(p)
    risk_tol = calc_risk_tolerance_friction(p)
    specific = calc_customer_specific_risk_friction(p)
    trust = calc_trust_gap_friction(p)
    climate = calc_sector_risk_climate(p)
    return _normalise_risk_pillar(
        [
            ("regulatory_complexity", regulatory, bool(regulatory.get("has_input"))),
            ("data_sensitivity_friction", data_sens, bool(data_sens.get("has_input"))),
            ("risk_tolerance_friction", risk_tol, bool(risk_tol.get("has_input"))),
            ("customer_specific_risk_friction", specific, bool(specific.get("has_input"))),
            ("trust_gap_friction", trust, bool(trust.get("has_input"))),
            ("sector_risk_climate", climate, bool(climate.get("has_input"))),
        ],
        CFR_ATTAINABLE,
    )


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 – IMPLEMENTATION RISK
# ─────────────────────────────────────────────────────────────────────────────


def _integration_system_score(label: str) -> float | None:
    s = label.lower()
    table = (
        ("custom internal", 30),
        ("erp", 25),
        ("data warehouse", 18),
        ("siem", 15),
        ("ticketing", 12),
        ("crm", 12),
        ("ci/cd", 8),
        ("ci-cd", 8),
        ("code hosting", 6),
        ("identity", 5),
        ("sso", 5),
        ("none", 0),
    )
    for needle, pts in table:
        if needle in s:
            return float(pts)
    return None


def calc_integration_complexity(p: dict[str, Any]) -> dict[str, Any]:
    systems = p.get("likelyIntegrationSystems")
    if isinstance(systems, list) and systems:
        per_point_scores = []
        unmatched = []
        for raw in systems:
            label = str(raw or "").strip()
            if not label:
                continue
            score = _integration_system_score(label)
            if score is None:
                unmatched.append(label)
                _note_unmatched(p, "likelyIntegrationSystems", label)
                continue
            per_point_scores.append({"system_type": label, "complexity_score": score})
        if not per_point_scores:
            return {"has_input": False, "value": 0, "exclude_reason": "unmatched"}
        avg = sum(pt["complexity_score"] for pt in per_point_scores) / len(per_point_scores)
        n = len(per_point_scores)
        count_penalty = max(0, n - 3) * 5
        value = min(60, avg + count_penalty)
        return {
            "has_input": True,
            "integration_points": per_point_scores,
            "integration_point_count": n,
            "average_complexity": _pf(avg),
            "system_count_penalty": count_penalty,
            "unmatched_systems": unmatched,
            "value": _pf(value),
        }

    integration_points = p.get("integrationPoints")
    if not integration_points or len(integration_points) == 0:
        return {
            "has_input": False,
            "integration_points": [],
            "integration_point_count": 0,
            "value": 0,
            "exclude_reason": "no_input",
        }

    legacy_map: dict[str, float] = {
        "Legacy_mainframe": 35,
        "Legacy_client_server": 28,
        "Modern_monolith": 20,
        "Microservices": 15,
        "Cloud_native_API": 10,
        "SaaS_standard_connector": 5,
        "Custom_internal_APIs": 30,
        "ERP": 25,
        "Data_warehouse": 18,
        "SIEM": 15,
        "Ticketing": 12,
        "CRM": 12,
        "CI_CD": 8,
        "Code_hosting": 6,
        "Identity_SSO": 5,
        "None": 0,
    }
    per_point_scores = []
    for pt in integration_points:
        system_type = pt.get("systemType") if isinstance(pt, dict) else None
        score = legacy_map.get(system_type) if system_type else None
        if score is None and isinstance(system_type, str):
            score = _integration_system_score(system_type)
        if score is None:
            _note_unmatched(p, "systemType", system_type)
            continue
        per_point_scores.append({"system_type": system_type, "complexity_score": score})
    if not per_point_scores:
        return {"has_input": False, "value": 0, "exclude_reason": "unmatched"}
    avg = sum(pt["complexity_score"] for pt in per_point_scores) / len(per_point_scores)
    count_penalty = max(0, len(per_point_scores) - 3) * 5
    return {
        "has_input": True,
        "integration_points": per_point_scores,
        "integration_point_count": len(per_point_scores),
        "average_complexity": _pf(avg),
        "system_count_penalty": count_penalty,
        "value": _pf(min(60, avg + count_penalty)),
    }


def calc_customization_required(p: dict[str, Any]) -> dict[str, Any]:
    cust_map: dict[str, float] = {
        "None (use as-is)": 0,
        "Minimal (configuration only)": 5,
        "Moderate (config + light dev)": 15,
        "Significant (custom model training)": 25,
        "Extensive (significant dev)": 40,
        "Custom_build": 40,
    }
    industry_penalty_map: dict[str, float] = {
        "Healthcare": 12,
        "Financial_Services": 10,
        "Government": 8,
    }
    base = _lookup(p, "customizationLevel", cust_map, "customizationLevel")
    if base is None:
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}

    industry_penalty = 0.0
    if base >= 15:
        sector = p.get("sector")
        if sector in industry_penalty_map:
            industry_penalty = industry_penalty_map[sector]
        elif _has_input(sector):
            industry_penalty = 5

    functions = p.get("targetUserFunctions") or p.get("targetUserFunction") or []
    if isinstance(functions, str):
        functions = [functions] if functions.strip() else []
    fn_count = len([x for x in functions if str(x).strip()]) if isinstance(functions, list) else 0
    workflow_penalty = 3 * min(4, fn_count)
    if fn_count == 0:
        workflow_penalty = int(p.get("businessProcessChangesRequired") or 0) * 3

    return {
        "has_input": True,
        "base_customization_effort": base,
        "industry_specific_penalty": industry_penalty,
        "target_user_function_count": fn_count,
        "workflow_modification_penalty": workflow_penalty,
        "value": base + industry_penalty + workflow_penalty,
    }


def calc_timeline_pressure(p: dict[str, Any]) -> dict[str, Any]:
    band_map: dict[str, float] = {
        "Immediate": 30,
        "1-3 months": 20,
        "3-6 months": 10,
        "6-12 months": 5,
        "12-18 months": 2,
        "18+ months": 0,
        "Exploratory": 0,
    }
    label = p.get("implementationTimelineBand")
    if not _has_input(label):
        months = p.get("implementationTimelineMonths")
        if months is None:
            return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
        try:
            m = float(months)
        except (TypeError, ValueError):
            return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
        if m < 2:
            base_risk, label = 30, "Immediate"
        elif m < 3:
            base_risk, label = 20, "1-3 months"
        elif m < 6:
            base_risk, label = 10, "3-6 months"
        elif m < 12:
            base_risk, label = 5, "6-12 months"
        elif m < 18:
            base_risk, label = 2, "12-18 months"
        else:
            base_risk, label = 0, "18+ months"
        return {
            "has_input": True,
            "implementation_timeline_band": label,
            "implementation_timeline_months": months,
            "exploratory": False,
            "value": base_risk,
        }

    sl = str(label).lower()
    band_key = None
    if "exploratory" in sl:
        band_key = "Exploratory"
    elif "immediate" in sl:
        band_key = "Immediate"
    elif "1-3" in sl:
        band_key = "1-3 months"
    elif "3-6" in sl:
        band_key = "3-6 months"
    elif "6-12" in sl:
        band_key = "6-12 months"
    elif "12-18" in sl:
        band_key = "12-18 months"
    elif "18+" in sl:
        band_key = "18+ months"
    if band_key is None:
        _note_unmatched(p, "implementationTimeline", label)
        return {"has_input": False, "value": 0, "exclude_reason": "unmatched"}
    return {
        "has_input": True,
        "implementation_timeline_band": band_key,
        "exploratory": band_key == "Exploratory",
        "value": band_map[band_key],
    }


def calc_control_coverage_gap(p: dict[str, Any]) -> dict[str, Any]:
    """Document 2 §5.4. Absent implemented categories scores full 40 (T2-02)."""
    implemented_raw = p.get("implementedMitigationCategories")
    if not isinstance(implemented_raw, list):
        implemented_raw = p.get("proposedMitigations") or []
    implemented = [str(x).strip() for x in implemented_raw if str(x).strip()] if isinstance(implemented_raw, list) else []
    proposed_count = int(p.get("proposedMitigationsCount") or 0)
    has_implemented = bool(implemented) or proposed_count > 0
    has_risks = p.get("customerSpecificRiskCount") is not None or p.get(
        "_has_customer_specific_risks"
    )
    risk_count = int(p.get("customerSpecificRiskCount") or 0)
    required = risk_count * 4
    if not has_implemented:
        # T2-02: risks were collected and no implemented set is determinable.
        # An unanswered form (no risks, no mitigations) is excluded, not scored 40.
        if not has_risks:
            return {
                "has_input": False,
                "value": 0,
                "exclude_reason": "no_input",
            }
        return {
            "has_input": True,
            "required_categories": required,
            "implemented_count": 0,
            "missing_categories": [],
            "value": 40,
            "note": "absent evidence scores full risk",
        }
    impl_n = len(implemented) if implemented else proposed_count
    if required <= 0:
        gap_ratio = 0.0
    else:
        gap_ratio = max(0.0, 1.0 - (impl_n / required))
    return {
        "has_input": True,
        "required_categories": required,
        "implemented_count": impl_n,
        "gap_ratio": _pf(gap_ratio),
        "value": _pf(gap_ratio * 40),
    }


def calc_feature_gap(p: dict[str, Any]) -> dict[str, Any]:
    """Withdrawn from Document 2 IR; kept as unused helper for older traces."""
    return {"has_input": False, "value": 0, "not_implemented": True, "exclude_reason": "withdrawn"}


def calc_mitigation_gap(p: dict[str, Any]) -> dict[str, Any]:
    return calc_control_coverage_gap(p)


def calculate_implementation_risk(p: dict[str, Any]) -> dict[str, Any]:
    integration = calc_integration_complexity(p)
    customization = calc_customization_required(p)
    timeline = calc_timeline_pressure(p)
    coverage = calc_control_coverage_gap(p)
    return _normalise_risk_pillar(
        [
            ("integration_complexity", integration, bool(integration.get("has_input"))),
            ("customization_required", customization, bool(customization.get("has_input"))),
            ("timeline_pressure", timeline, bool(timeline.get("has_input"))),
            ("control_coverage_gap", coverage, bool(coverage.get("has_input"))),
        ],
        IR_ATTAINABLE,
    )


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 – COMPETITIVE RISK
# ─────────────────────────────────────────────────────────────────────────────


def _eng_headcount_mid(raw: Any) -> int | None:
    if not _has_input(raw):
        return None
    s = str(raw).lower()
    if "not known" in s:
        return None
    if "under 50" in s or s.strip() in ("<50", "< 50"):
        return 25
    if "5,000+" in s or "5000+" in s:
        return 5000
    if "1,000" in s or "1000" in s:
        return 1000
    if "250" in s:
        return 250
    if "50" in s:
        return 50
    return None


def calc_competitive_alternatives(p: dict[str, Any]) -> dict[str, Any]:
    rows = p.get("competitorRows")
    weighted_count = None
    incumbent = False
    if isinstance(rows, list) and rows:
        weighted_count = 0.0
        for row in rows:
            if not isinstance(row, dict):
                weighted_count += 1
                continue
            basis = str(row.get("basis") or "").lower()
            weighted_count += 0.5 if "market inference" in basis else 1.0
            inc = str(row.get("incumbent") or "").lower()
            if inc in ("yes", "true", "1"):
                incumbent = True
    competitor_map: dict[str, float] = {
        "0 (sole source)": 0,
        "1 competitor": 10,
        "2-3 competitors": 20,
        "4+ competitors": 25,
    }
    if weighted_count is not None:
        if weighted_count <= 0:
            base_competition = 0
            competitor_count = "0 (sole source)"
        elif weighted_count <= 1:
            base_competition = 10
            competitor_count = "1 competitor"
        elif weighted_count <= 3:
            base_competition = 20
            competitor_count = "2-3 competitors"
        else:
            base_competition = 25
            competitor_count = "4+ competitors"
    else:
        competitor_count = p.get("competitorCount")
        if not _has_input(competitor_count):
            base_competition = None
        else:
            base_competition = competitor_map.get(competitor_count)
            if base_competition is None:
                _note_unmatched(p, "competitorCount", competitor_count)
        if base_competition is None and weighted_count is None:
            # Build-vs-buy can still contribute without a competitor count.
            base_competition = 0
            competitor_count = None

    if incumbent:
        base_competition = (base_competition or 0) + 5

    build_raw = p.get("buildVsBuySignal")
    if not _has_input(build_raw) and p.get("customerConsideringBuildVsBuy") is not None:
        if p.get("customerConsideringBuildVsBuy"):
            build_pts = 20
            build_label = "Yes"
        else:
            build_pts = 0
            build_label = "No"
    elif not _has_input(build_raw):
        build_pts = None
        build_label = None
    else:
        sl = str(build_raw).lower()
        if sl.startswith("yes"):
            build_pts, build_label = 20, "Yes"
        elif sl.startswith("possible"):
            build_pts, build_label = 10, "Possible"
        elif "not known" in sl:
            build_pts, build_label = 5, "Not known"
        elif sl.startswith("no"):
            build_pts, build_label = 0, "No"
        else:
            _note_unmatched(p, "buildVsBuySignal", build_raw)
            build_pts, build_label = None, str(build_raw)

    if build_pts is not None:
        eng = _eng_headcount_mid(p.get("customerEngHeadcount"))
        if eng is not None and eng >= 1000:
            build_pts *= 1.25
        elif eng is not None and eng < 50:
            build_pts *= 0.75

    has_comp = weighted_count is not None or _has_input(p.get("competitorCount"))
    has_build = build_pts is not None
    if not has_comp and not has_build:
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}

    value = (base_competition or 0) + (build_pts or 0)
    return {
        "has_input": True,
        "competitor_count_label": competitor_count,
        "weighted_competitor_count": weighted_count,
        "incumbent_flag": incumbent,
        "base_competition_points": base_competition,
        "build_option": build_label,
        "build_option_penalty": build_pts,
        "value": _pf(value),
    }


_BUDGET_POINTS = {
    "< $50K": 35,
    "$50K-$100K": 30,
    "$100K-$250K": 25,
    "$250K-$500K": 15,
    "$500K-$1M": 10,
    "$1M-$5M": 5,
    "$5M-$10M": 2,
    "> $10M": 0,
    "Not known": 15,
    # legacy keys
    "< $100K": 35,
    "$100K-$250K": 25,
    "$1M-$5M": 5,
    "> $5M": 2,
}
_BUDGET_MIDPOINT = {
    "< $50K": 25_000,
    "$50K-$100K": 75_000,
    "$100K-$250K": 175_000,
    "$250K-$500K": 375_000,
    "$500K-$1M": 750_000,
    "$1M-$5M": 3_000_000,
    "$5M-$10M": 7_500_000,
    "> $10M": 15_000_000,
    "< $100K": 50_000,
    "> $5M": 7_500_000,
}


def _revenue_midpoint(raw: Any) -> float | None:
    if not _has_input(raw):
        return None
    s = str(raw).lower()
    if "not disclosed" in s or "not known" in s:
        return None
    table = (
        ("over $10b", 15_000_000_000),
        ("$1b-$10b", 5_500_000_000),
        ("$500m-$1b", 750_000_000),
        ("$100m-$500m", 300_000_000),
        ("$10m-$100m", 55_000_000),
        ("under $10m", 5_000_000),
    )
    compact = s.replace(" ", "")
    for key, mid in table:
        if key.replace("$", "") in compact.replace("$", ""):
            return float(mid)
    return None


def calc_budget_constraint(p: dict[str, Any]) -> dict[str, Any]:
    band = p.get("budgetMidpoint")
    if not _has_input(band):
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
    pts = _BUDGET_POINTS.get(str(band))
    if pts is None:
        _note_unmatched(p, "budgetMidpoint", band)
        return {"has_input": False, "value": 0, "exclude_reason": "unmatched"}

    affordability = 0
    mid = _BUDGET_MIDPOINT.get(str(band))
    revenue = _revenue_midpoint(p.get("customerAnnualRevenue"))
    if mid is not None and revenue and revenue > 0 and mid > 0.005 * revenue:
        affordability += 5
    ownership = str(p.get("customerOwnership") or "").lower()
    if "government" in ownership or "state-owned" in ownership:
        affordability -= 3

    return {
        "has_input": True,
        "budget_midpoint": band,
        "budget_base_points": pts,
        "affordability_adjustment": affordability,
        "value": pts + affordability,
    }


def calc_competitive_advantage(p: dict[str, Any]) -> dict[str, Any]:
    category_value = {
        "Compliance": 10,
        "Security": 8,
        "Price": 7,
        "Product": 6,
        "Support": 5,
        "Ecosystem": 5,
        "Regulatory_certification": 10,
        "Technology_leadership": 8,
        "Lower_TCO": 7,
        "Superior_feature_set": 6,
        "Faster_deployment": 5,
        "Proven_customer_in_sector": 5,
        "Domain_expertise": 6,
    }
    differentiators = p.get("uniqueDifferentiators") or []
    seen: set[str] = set()
    breakdown = []
    for d in differentiators:
        if not isinstance(d, dict):
            continue
        advantage_type = d.get("advantageType") or d.get("category")
        if not advantage_type:
            continue
        canonical = str(advantage_type).strip()
        key = canonical.lower()
        if key in seen:
            continue
        pts = category_value.get(canonical)
        if pts is None:
            mapped = {
                "product": "Product",
                "security": "Security",
                "compliance": "Compliance",
                "price": "Price",
                "support": "Support",
                "ecosystem": "Ecosystem",
            }.get(key)
            pts = category_value.get(mapped) if mapped else None
            canonical = mapped or canonical
        if pts is None:
            _note_unmatched(p, "advantageType", advantage_type)
            continue
        seen.add(key)
        breakdown.append({"advantage_type": canonical, "value": pts})
    differentiator_total = sum(d["value"] for d in breakdown)
    differentiator_total = min(differentiator_total, 36)

    sector_fit = 0
    target = p.get("productTargetIndustries") or []
    sector = str(p.get("sector") or "").lower()
    if sector and isinstance(target, list):
        hay = " ".join(str(x).lower() for x in target)
        if sector.replace("_", " ") in hay or any(
            token in hay for token in sector.lower().split("_") if len(token) > 3
        ):
            sector_fit = -5

    advantage = -differentiator_total + sector_fit
    advantage = max(-50, advantage)
    has_input = bool(breakdown) or bool(target)
    if not has_input:
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
    return {
        "has_input": True,
        "unique_differentiators": breakdown,
        "differentiator_total": differentiator_total,
        "sector_fit": sector_fit,
        "airi_competitor_evidence": 0,
        "note": "Negative value = competitive advantage (reduces risk). AIRI V-7 skipped.",
        "value": _pf(max(-50, advantage)),
    }


def calc_vendor_buyer_maturity_gap(p: dict[str, Any]) -> dict[str, Any]:
    gap_table: dict[str, dict[str, float]] = {
        "startup": {"Enterprise": 25, "Mid_market": 15, "SMB": 5},
        "growth": {"Enterprise": 15, "Mid_market": 5, "SMB": 0},
        "established": {"Enterprise": 5, "Mid_market": 0, "SMB": 0},
        "mature": {"Enterprise": 0, "Mid_market": 0, "SMB": 0},
    }
    stage = p.get("vendorStage")
    ctype = p.get("customerType")
    if not _has_input(stage) or not _has_input(ctype):
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
    stage_row = gap_table.get(stage)
    if not stage_row:
        _note_unmatched(p, "vendorStage", stage)
        return {"has_input": False, "value": 0, "exclude_reason": "unmatched"}
    if ctype not in stage_row:
        _note_unmatched(p, "customerType", ctype)
        return {"has_input": False, "value": 0, "exclude_reason": "unmatched"}
    base_gap = stage_row[ctype]

    ratio_penalty = 0.0
    cust_emp = p.get("customerEmployeeCount")
    vend_emp = p.get("vendorEmployeeCount")
    try:
        c_n = float(cust_emp) if cust_emp is not None else None
        v_n = float(vend_emp) if vend_emp is not None else None
    except (TypeError, ValueError):
        c_n, v_n = None, None
    if c_n and v_n and v_n > 0:
        ratio = c_n / v_n
        if ratio > 10:
            ratio_penalty = min(15.0, ratio * 1.5)

    ai_mature = False
    leadership = str(p.get("customerAiLeadership") or "").lower()
    policy = str(p.get("customerPublicAiPolicy") or "").lower()
    evidence = p.get("customerAiMaturityEvidence") or []
    if "chief ai" in leadership or "chief data" in leadership:
        if policy.startswith("yes") or (
            isinstance(evidence, list)
            and any("policy" in str(x).lower() for x in evidence)
        ):
            ai_mature = True
    startup_penalty = 5 if ai_mature and stage == "startup" else 0

    return {
        "has_input": True,
        "vendor_stage": stage,
        "customer_type": ctype,
        "base_maturity_gap": base_gap,
        "employee_ratio_penalty": _pf(ratio_penalty),
        "ai_mature_startup_penalty": startup_penalty,
        "value": _pf(base_gap + ratio_penalty + startup_penalty),
    }


def calc_opportunity_type(p: dict[str, Any]) -> dict[str, Any]:
    raw = p.get("opportunityType")
    if not _has_input(raw):
        return {"has_input": False, "value": 0, "exclude_reason": "no_input"}
    s = str(raw).lower()
    if "renewal" in s:
        pts, label = -12, "Renewal"
    elif "expansion" in s:
        pts, label = -6, "Expansion"
    elif "displacement" in s:
        pts, label = 8, "Competitive displacement"
    elif "speculative" in s:
        pts, label = 6, "Speculative"
    elif "new logo" in s:
        pts, label = 0, "New logo"
    else:
        _note_unmatched(p, "opportunityType", raw)
        return {"has_input": False, "value": 0, "exclude_reason": "unmatched"}
    return {"has_input": True, "opportunity_type": label, "value": pts}


def calculate_competitive_risk(p: dict[str, Any]) -> dict[str, Any]:
    alternatives = calc_competitive_alternatives(p)
    budget = calc_budget_constraint(p)
    advantage = calc_competitive_advantage(p)
    maturity_gap = calc_vendor_buyer_maturity_gap(p)
    opportunity = calc_opportunity_type(p)

    parts = [
        ("competitive_alternatives", alternatives),
        ("budget_constraint", budget),
        ("competitive_advantage", advantage),
        ("vendor_buyer_maturity_gap", maturity_gap),
        ("opportunity_type", opportunity),
    ]
    excluded = []
    included = []
    raw = 0.0
    any_input = False
    for name, block in parts:
        if not block.get("has_input"):
            excluded.append({"group": name, "reason": block.get("exclude_reason") or "no_input"})
            continue
        any_input = True
        raw += float(block.get("value") or 0)
        included.append({"group": name, "earned": float(block.get("value") or 0)})
    if not any_input:
        return {
            "competitive_alternatives": alternatives,
            "budget_constraint": budget,
            "competitive_advantage": advantage,
            "vendor_buyer_maturity_gap": maturity_gap,
            "opportunity_type": opportunity,
            "included_groups": included,
            "excluded_groups": excluded,
            "not_implemented": True,
            "raw_total": 0.0,
            "value": None,
        }
    clamped = max(0.0, min(100.0, raw))
    return {
        "competitive_alternatives": alternatives,
        "budget_constraint": budget,
        "competitive_advantage": advantage,
        "vendor_buyer_maturity_gap": maturity_gap,
        "opportunity_type": opportunity,
        "included_groups": included,
        "excluded_groups": excluded,
        "not_implemented": False,
        "raw_total": _pf(raw),
        "is_floored": raw < 0,
        "is_capped": raw > 100,
        "value": _pf(clamped),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 – FINAL SALES RISK SCORE
# ─────────────────────────────────────────────────────────────────────────────


def interpret_sales_risk_score(deal_probability: float) -> dict[str, str]:
    if deal_probability >= 90:
        return {
            "grade": "A",
            "classification": "High confidence",
            "deal_characteristics": "Low friction; strong fit; weak competition",
            "recommended_actions": "Standard sales process; focus on value demonstration",
        }
    if deal_probability >= 80:
        return {
            "grade": "B",
            "classification": "Favourable",
            "deal_characteristics": "Minor friction; good fit; manageable competition",
            "recommended_actions": "Standard sales process; executive sponsorship helpful",
        }
    if deal_probability >= 70:
        return {
            "grade": "C",
            "classification": "Moderate",
            "deal_characteristics": "Some friction; gaps present; competitive pressure",
            "recommended_actions": "Extended sales cycle; custom proposal with mitigation roadmap",
        }
    if deal_probability >= 60:
        return {
            "grade": "D",
            "classification": "Review strategy",
            "deal_characteristics": "High friction; notable gaps; strong competition",
            "recommended_actions": "Executive engagement required; review resource investment before pursuing",
        }
    return {
        "grade": "F",
        "classification": "Reassess",
        "deal_characteristics": "Critical friction; major gaps; intense competition",
        "recommended_actions": "Reassess deal viability; only pursue if strategically critical",
    }


def evaluate_blocker_gates(p: dict[str, Any]) -> list[dict[str, str]]:
    """Document 2 §7 — gates override the recommendation, not the score."""
    gates: list[dict[str, str]] = []
    required_cert = p.get("customerRequiredCertification")
    held = [str(x).lower() for x in (p.get("vendorCertifications") or [])]
    if _has_input(required_cert):
        needle = str(required_cert).lower()
        in_progress = bool(p.get("vendorCertificationInProgress"))
        if needle and not any(needle in h for h in held) and not in_progress:
            gates.append({
                "gate": "Mandatory certification absent",
                "recommendation": "Do not pursue as specified",
            })
    customer_deploy = str(p.get("customerDeploymentModel") or p.get("implementationApproach") or "").lower()
    product_deploy = str(p.get("productDeploymentModel") or "").lower()
    if "on-premise" in customer_deploy or "on premise" in customer_deploy:
        if product_deploy and "saas" in product_deploy and "on-prem" not in product_deploy:
            gates.append({
                "gate": "Deployment model impossible",
                "recommendation": "Do not pursue as specified",
            })
    required_residency = p.get("customerDataResidency")
    product_residency = p.get("productDataResidency") or []
    if _has_input(required_residency) and _has_input(product_residency):
        hay = " ".join(str(x).lower() for x in product_residency) if isinstance(product_residency, list) else str(product_residency).lower()
        if str(required_residency).lower() not in hay:
            gates.append({
                "gate": "Data residency impossible",
                "recommendation": "Do not pursue as specified",
            })
    return gates


def calc_confidence_band(p: dict[str, Any]) -> dict[str, Any]:
    conf_raw = str(p.get("answerConfidence") or "").lower()
    if conf_raw.startswith("high"):
        band, width = "High", 3
    elif conf_raw.startswith("low"):
        band, width = "Low", 12
    elif conf_raw.startswith("medium"):
        band, width = "Medium", 7
    else:
        band, width = "Medium", 7
        if not _has_input(p.get("answerConfidence")):
            band, width = "Low", 12
    widen = 0
    basis = str(p.get("informationBasis") or "").lower()
    if "public sources only" in basis:
        widen += 3
    research = p.get("researchDate")
    if _has_input(research):
        try:
            raw = str(research).strip()[:10]
            dt = datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - dt).days
            if age > 90:
                widen += 2
        except ValueError:
            pass
    return {
        "band": band,
        "base_width": width,
        "widen": widen,
        "plus_minus": width + widen,
        "information_basis": p.get("informationBasis"),
        "answer_confidence": p.get("answerConfidence"),
        "research_date": p.get("researchDate"),
    }


def calculate_sales_risk_score(user_input: dict[str, Any]) -> dict[str, Any]:
    cfr = calculate_customer_friction_risk(user_input)
    ir = calculate_implementation_risk(user_input)
    cr = calculate_competitive_risk(user_input)

    # Document 2 §3 declares fixed pillar weights. Missing groups drop inside
    # CFR/IR; headline weights are never redistributed. Document 0 §7 AIRI is not applied.
    weights = dict(PILLAR_WEIGHTS)
    cfr_val = float(cfr["value"] or 0)
    ir_val = float(ir["value"] or 0)
    cr_val = float(cr["value"] or 0)
    cfr_w = weights["customer_friction"]
    ir_w = weights["implementation"]
    cr_w = weights["competitive"]
    weighted_risk = cfr_val * cfr_w + ir_val * ir_w + cr_val * cr_w
    srs = _pf(min(100.0, max(0.0, weighted_risk)), 2)
    scs = _pf(max(0.0, min(100.0, 100.0 - srs)), 2)
    scs_rounded = max(0, min(100, round(scs)))
    interpretation = interpret_sales_risk_score(scs_rounded)
    gates = evaluate_blocker_gates(user_input)
    if gates:
        interpretation = {
            **interpretation,
            "recommended_actions": gates[0]["recommendation"],
            "blocker_gate": gates[0]["gate"],
        }
    band = calc_confidence_band(user_input)
    degraded = user_input.get("_degraded_fields") if isinstance(user_input.get("_degraded_fields"), list) else []
    unmatched = user_input.get("_unmatched") if isinstance(user_input.get("_unmatched"), list) else []

    return {
        "sales_risk_score": srs,
        "sales_confidence_score": scs,
        "deal_probability_pct": scs,
        "customer_friction_risk": cfr_val,
        "implementation_risk": ir_val,
        "competitive_risk": cr_val,
        "grade": interpretation["grade"],
        "classification": interpretation["classification"],
        "deal_characteristics": interpretation["deal_characteristics"],
        "recommended_actions": interpretation["recommended_actions"],
        "scoring_source": "degraded" if (degraded or unmatched) else "formula",
        "scoring_version": SCORING_VERSION,
        "calibration_version": CALIBRATION_VERSION,
        "degraded_fields": degraded,
        "detail": {
            "customer_friction_risk": cfr,
            "implementation_risk": ir,
            "competitive_risk": cr,
            "blocker_gates": gates,
            "confidence_band": band,
            "final_formula": {
                "expression": "SCS = 100 − [ CFR × 0.35 + IR × 0.35 + CR × 0.30 ]",
                "pillar_weights": weights,
                "customer_friction_contribution": _pf(cfr_val * cfr_w),
                "implementation_risk_contribution": _pf(ir_val * ir_w),
                "competitive_risk_contribution": _pf(cr_val * cr_w),
                "base_weighted_sum": _pf(weighted_risk),
                "sales_risk_score": srs,
                "sales_confidence_score": scs,
            },
            "score_trace": {
                "registry_version": SCORING_VERSION,
                "calibration_version": CALIBRATION_VERSION,
                "unmatched_markers": unmatched,
                "excluded_groups": {
                    "customer_friction": cfr.get("excluded_groups") or [],
                    "implementation": ir.get("excluded_groups") or [],
                    "competitive": cr.get("excluded_groups") or [],
                },
            },
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# PAYLOAD NORMALIZERS / FORMULA INPUT BUILDER
# ─────────────────────────────────────────────────────────────────────────────


def to_string_value(v: Any) -> str:
    return str(v if v is not None else "").strip()


def _vendor_stage_for_formula(payload: dict[str, Any]) -> str | None:
    raw = to_string_value(
        payload.get("vendorStage")
        or payload.get("vendor_stage")
        or payload.get("vendorMaturity")
        or payload.get("vendor_maturity")
        or payload.get("company_stage")
    ).lower()
    if any(t in raw for t in ("startup", "early-stage", "early stage", "seed")):
        return "startup"
    if any(t in raw for t in ("mature", "publicly", "profitable")):
        return "mature"
    if any(t in raw for t in ("established", "late")):
        return "established"
    if any(t in raw for t in ("growth", "scaling")):
        return "growth"
    return None


def _years_in_customer_sector(payload: dict[str, Any]) -> int:
    explicit = payload.get("yearsInCustomerSector") or payload.get("years_in_customer_sector")
    n = _safe_int(explicit, -1)
    if n >= 0:
        return n
    founded = payload.get("yearFounded") or payload.get("year_founded")
    year = _safe_int(founded, 0)
    if 1900 <= year <= datetime.now().year:
        return max(0, datetime.now().year - year)
    return 0


def _vendor_employee_count(payload: dict[str, Any]) -> int:
    raw = (
        payload.get("vendorEmployeeCount")
        or payload.get("vendor_employee_count")
        or payload.get("employeeCount")
        or payload.get("no_of_employees")
        or payload.get("employee_count")
    )
    if isinstance(raw, (int, float)) and raw > 0:
        return int(raw)
    from services.scoring_service import band_employee_count

    band = band_employee_count(raw)
    return {
        "1-10": 5,
        "11-50": 30,
        "51-200": 125,
        "201-1000": 500,
        "1001-5000": 3000,
        "5001-10000": 7500,
        "10000+": 15000,
    }.get(band, 50)


def _product_feature_match_pct(payload: dict[str, Any]) -> int:
    explicit = payload.get("productFeatureMatchPct") or payload.get("product_feature_match_pct")
    n = _safe_int(explicit, -1)
    if 0 <= n <= 100:
        return n
    features = to_string_list(
        payload.get("product_features")
        if payload.get("product_features") is not None
        else payload.get("productFeatures")
    )
    if not features:
        return 50
    return min(100, 40 + 8 * min(len(features), 7))


def _safe_normalize(fn, raw: str, fallback: str | None = None, payload: dict[str, Any] | None = None, field: str = "") -> str | None:
    try:
        got = fn(raw)
        if got is None:
            return None
        return got
    except Exception:
        if payload is not None and field:
            _note_degraded(payload, field)
        return fallback


def _safe_int(v: Any, default: int = 0) -> int:
    try:
        if v is None or v is False:
            return default
        return int(v)
    except (TypeError, ValueError):
        return default


_NONE_SELECTION = re.compile(r"^none(\b|/|-)", re.I)


def _is_none_selection(s: str) -> bool:
    return bool(_NONE_SELECTION.match(s.strip()))


def to_string_list(v: Any) -> list[str]:
    if isinstance(v, list):
        return [
            str(x if x is not None else "").strip()
            for x in v
            if str(x if x is not None else "").strip()
            and not _is_none_selection(str(x))
        ]
    s = to_string_value(v)
    if not s:
        return []
    if s[0] in ("[", "{"):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return to_string_list(parsed)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return [x.strip() for x in s.split(",") if x.strip() and not _is_none_selection(x)]


def structured_option_list(v: Any) -> list[str]:
    """Structured chip values only — do not score comma frequency in prose."""
    if isinstance(v, list):
        return [
            str(x).strip()
            for x in v
            if str(x or "").strip() and not _is_none_selection(str(x))
        ]
    s = to_string_value(v)
    if not s or _is_none_selection(s):
        return []
    if s[0] in ("[", "{"):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return structured_option_list(parsed)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    return [s]


def regulatory_requirements_to_string_list(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x if x is not None else "").strip() for x in v if str(x if x is not None else "").strip()]
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return []
        c0 = s[0]
        if c0 in ("[", "{"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [
                        str(x if x is not None else "").strip()
                        for x in parsed
                        if str(x if x is not None else "").strip()
                    ]
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        return [x.strip() for x in s.split(",") if x.strip()]
    return []


def normalize_sector_for_formula(raw: str) -> str | None:
    s = raw.lower()
    if not s.strip():
        return None
    if "autonomous" in s:
        return "Autonomous_Systems"
    healthcare = any(t in s for t in ("healthcare", "hospital", "medical", "pharma"))
    financial = "financial" in s or "bank" in s or ("insurance" in s and "health" not in s)
    government = "government" in s or "federal" in s
    ecommerce = "retail" in s or "e-commerce" in s or "ecommerce" in s
    technology = "technology" in s or "software" in s
    if healthcare:
        return "Healthcare"
    if financial:
        return "Financial_Services"
    if government:
        return "Government"
    if ecommerce:
        return "E_Commerce"
    if technology:
        return "Technology"
    return "Other"


def normalize_risk_tolerance_for_formula(raw: str) -> str | None:
    s = raw.lower().strip()
    if not s:
        return None
    if "not known" in s:
        return None
    if s.startswith("very low") or "zero tolerance" in s:
        return "Very_Low"
    if s.startswith("low"):
        return "Conservative"
    if s.startswith("very high"):
        return "Very_High"
    if s.startswith("high"):
        return "Aggressive"
    if s.startswith("moderate"):
        return "Moderate"
    return None


def normalize_data_sensitivity_for_formula(raw: str) -> str | None:
    s = raw.lower()
    if not s.strip():
        return None
    if s.startswith("public") or "no sensitive" in s:
        return "Public"
    if "extremely sensitive" in s or "national security" in s or "itar" in s or "cui" in s:
        return "Extremely_Sensitive"
    if "highly sensitive" in s:
        return "Highly_Sensitive"
    if s.startswith("sensitive") or "pii" in s or "business critical" in s:
        return "Sensitive"
    if "internal" in s or "business confidential" in s:
        return "Internal"
    if "phi" in s or "pci" in s:
        return "Highly_Sensitive"
    return None


def normalize_customization_for_formula(raw: str) -> str | None:
    s = raw.lower()
    if not s.strip():
        return None
    if "none" in s or "as-is" in s or "as is" in s:
        return "None (use as-is)"
    if "minimal" in s or "no code" in s:
        return "Minimal (configuration only)"
    if "moderate" in s:
        return "Moderate (config + light dev)"
    if "significant" in s:
        return "Significant (custom model training)"
    if "extensive" in s or "major" in s:
        return "Extensive (significant dev)"
    if "custom" in s:
        return "Custom_build"
    return None


def build_integration_points_for_formula(raw: str) -> list[dict[str, str]]:
    s = raw.lower()
    if "standalone" in s:
        return [{"systemType": "SaaS_standard_connector"}]
    if "simple" in s:
        return [{"systemType": "Cloud_native_API"}]
    if "moderate" in s:
        return [
            {"systemType": "Microservices"},
            {"systemType": "Modern_monolith"},
        ]
    if "complex" in s and "very" not in s:
        return [
            {"systemType": "Legacy_client_server"},
            {"systemType": "Modern_monolith"},
            {"systemType": "Microservices"},
            {"systemType": "Cloud_native_API"},
        ]
    return [
        {"systemType": "Legacy_mainframe"},
        {"systemType": "Legacy_client_server"},
        {"systemType": "Modern_monolith"},
        {"systemType": "Microservices"},
        {"systemType": "Cloud_native_API"},
    ]


def timeline_months_for_formula(raw: str) -> int | None:
    s = raw.lower()
    if not s.strip():
        return None
    if "exploratory" in s or "no specific" in s:
        return 0
    if "immediate" in s:
        return 1
    if "1-3" in s:
        return 2
    if "3-6" in s:
        return 5
    if "6-12" in s:
        return 9
    if "12-18" in s:
        return 15
    if "18+" in s:
        return 20
    return None


def budget_for_formula(raw: str) -> str | None:
    s = raw.lower()
    if not s.strip():
        return None
    if "not yet determined" in s or "undetermined" in s or "not known" in s:
        return "Not known"
    if "under $50" in s:
        return "< $50K"
    if "$50k - $100k" in s or "$50k-$100k" in s:
        return "$50K-$100K"
    if "$100k - $250k" in s or "$100k-$250k" in s:
        return "$100K-$250K"
    if "$250k - $500k" in s or "$250k-$500k" in s:
        return "$250K-$500K"
    if "$500k - $1m" in s or "$500k-$1m" in s:
        return "$500K-$1M"
    if "$1m - $5m" in s or "$1m-$5m" in s:
        return "$1M-$5M"
    if "$5m - $10m" in s or "$5m-$10m" in s:
        return "$5M-$10M"
    if "over $10" in s or "> $10" in s:
        return "> $10M"
    return None


def competitor_label_and_build(raw: str) -> tuple[str, bool]:
    s = (raw or "").strip()
    sl = s.lower()
    considering_build = bool(re.search(r"(?<![a-z])build(?![a-z])", sl))
    if not s:
        return None, False
    if "sole" in sl or "no alternative" in sl:
        return "0 (sole source)", considering_build
    parts = [p.strip() for p in re.split(r"[,;\n]| and ", s) if p.strip()]
    n = len(parts)
    if n >= 4:
        return "4+ competitors", considering_build
    if n >= 2:
        return "2-3 competitors", considering_build
    return "1 competitor", considering_build


def _first_present(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key not in payload:
            continue
        v = payload.get(key)
        if v is None:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        if isinstance(v, (list, dict)) and len(v) == 0:
            continue
        return v
    return None


def _parse_jsonish(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (list, dict)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if s[:1] in ("[", "{"):
            try:
                return json.loads(s)
            except (json.JSONDecodeError, TypeError, ValueError):
                return v
    return v


def _competitor_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    parsed = _parse_jsonish(_first_present(payload, "competitors"))
    if not isinstance(parsed, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in parsed:
        if isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            if name:
                rows.append(item)
        else:
            name = str(item or "").strip()
            if name:
                rows.append({"name": name})
    return rows


def _competitor_label_from_count(n: int) -> str:
    if n <= 0:
        return "0 (sole source)"
    if n == 1:
        return "1 competitor"
    if n <= 3:
        return "2-3 competitors"
    return "4+ competitors"


def _advantage_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    parsed = _parse_jsonish(
        _first_present(payload, "key_advantages_rows", "keyAdvantagesRows")
    )
    if not isinstance(parsed, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        text = str(item.get("advantage") or item.get("text") or "").strip()
        if not text:
            continue
        rows.append(item)
    return rows


# Document 2 §6.3 / R-35 — one count per category. Do not default unmatched chips.
_ADVANTAGE_CATEGORY_MAP = {
    "product": "Product",
    "feature": "Product",
    "security": "Security",
    "compliance": "Compliance",
    "regulatory": "Compliance",
    "price": "Price",
    "tco": "Price",
    "support": "Support",
    "ecosystem": "Ecosystem",
}
def _advantage_type_from_label(raw: Any) -> str | None:
    s = str(raw or "").strip().lower()
    if not s:
        return None
    for needle, canon in _ADVANTAGE_CATEGORY_MAP.items():
        if needle in s:
            return canon
    return None


def _differentiators_from_advantage_rows(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        cat = str(row.get("category") or "").strip()
        mapped = _advantage_type_from_label(cat) or _advantage_type_from_label(row.get("advantage"))
        if not mapped or mapped in seen:
            continue
        seen.add(mapped)
        out.append({"advantageType": mapped})
        if len(out) >= 6:
            break
    return out


def _headcount_midpoint(raw: Any) -> int | None:
    if raw is None or raw is False:
        return None
    if isinstance(raw, (int, float)) and raw > 0:
        return int(raw)
    compact = re.sub(r"[,\s]", "", str(raw)).replace("–", "-").replace("—", "-").lower()
    if not compact or compact.startswith("not"):
        return None
    table = (
        ("50000+", 75000),
        ("10001-50000", 30000),
        ("5001-10000", 7500),
        ("1001-5000", 3000),
        ("501-1000", 750),
        ("201-500", 350),
        ("51-200", 125),
        ("1-50", 25),
    )
    for key, mid in table:
        if key in compact:
            return mid
    return None


def _customer_type_from_headcount(mid: int) -> str:
    if mid >= 5001:
        return "Enterprise"
    if mid >= 501:
        return "Mid_market"
    return "SMB"


def _years_from_opportunity_type(raw: str) -> int | None:
    s = raw.lower()
    if not s.strip():
        return None
    if "renewal" in s:
        return 5
    if "expansion" in s:
        return 3
    if "new logo" in s or "speculative" in s or "displacement" in s:
        return 0
    return None


def _build_vs_buy_from_signal(raw: str) -> tuple[bool, str] | None:
    s = raw.lower().strip()
    if not s:
        return None
    if s.startswith("yes"):
        return True, "Strong (can build)"
    if s.startswith("possible"):
        return True, "Moderate (difficult build)"
    if s.startswith("no signal"):
        return False, "Weak (unlikely to build)"
    if "not known" in s:
        return False, "Weak (unlikely to build)"
    return None


def _capability_from_eng_headcount(raw: str) -> str | None:
    s = raw.lower()
    if not s.strip() or "not known" in s:
        return None
    if "under 50" in s:
        return "Weak (unlikely to build)"
    if s.startswith("50-") or "50-250" in s:
        return "Moderate (difficult build)"
    return "Strong (can build)"


def _approval_from_ownership(raw: str) -> str | None:
    s = raw.lower()
    if not s.strip() or "not known" in s:
        return None
    if "government" in s or "publicly" in s:
        return "Board_approval"
    if "pe owned" in s or "pe-owned" in s:
        return "C_suite_multiple"
    if "founder" in s or "family" in s:
        return "VP_and_below"
    if "vc" in s or "non-profit" in s or "ngo" in s:
        return "C_suite_single"
    return None


def _integration_band_from_systems(raw: Any) -> str | None:
    systems = to_string_list(raw)
    if raw is None or raw == "":
        return None
    named = [s for s in systems if s]
    n = len(named)
    if n == 0:
        return "Standalone - No Integrations Required"
    if n == 1:
        return "Simple - Single System Integration (e.g., SSO only)"
    if n <= 3:
        return "Moderate - 2-3 System Integrations"
    if n <= 6:
        return "Complex - 4-6 System Integrations"
    return "Very Complex - 7+ System Integrations or Legacy Systems"


def _ai_maturity_evidence_count(payload: dict[str, Any]) -> int | None:
    raw = _first_present(
        payload, "customer_ai_maturity_evidence", "customerAiMaturityEvidence"
    )
    if raw is None:
        return None
    items = to_string_list(raw)
    return len(items)


def customer_type_for_formula(budget_midpoint: str) -> str:
    if budget_midpoint in ("$1M-$5M", "> $5M"):
        return "Enterprise"
    if budget_midpoint in ("$250K-$500K", "$500K-$1M"):
        return "Mid_market"
    return "SMB"


def build_sales_risk_formula_input(payload: dict[str, Any]) -> dict[str, Any]:
    sector = _safe_normalize(
        normalize_sector_for_formula,
        to_string_value(payload.get("customer_sector") or payload.get("customerSector")),
        "Other",
        payload,
        "sector",
    )
    customer_specific_risks = to_string_list(
        payload.get("customer_specific_risks")
        if payload.get("customer_specific_risks") is not None
        else payload.get("customerSpecificRisks")
    )
    regulatory = [
        r for r in regulatory_requirements_to_string_list(
            payload.get("regulatory_requirements")
            if payload.get("regulatory_requirements") is not None
            else payload.get("regulatoryRequirements")
        )
        if not _is_none_selection(r)
    ]
    risk_mitigations = to_string_list(
        payload.get("risk_mitigation")
        if payload.get("risk_mitigation") is not None
        else payload.get("riskMitigation")
    )
    budget_midpoint = budget_for_formula(
        to_string_value(
            payload.get("customer_budget_range") or payload.get("customerBudgetRange")
        )
    )
    customer_emp = _headcount_midpoint(
        _first_present(payload, "customer_employee_count", "customerEmployeeCount")
    )
    if customer_emp is not None:
        customer_type = _customer_type_from_headcount(customer_emp)
        customer_employee_count = customer_emp
    else:
        customer_type = None
        customer_employee_count = None

    competitor_rows = _competitor_rows(payload)
    alternatives = to_string_value(
        payload.get("alternatives_considered") or payload.get("alternativesConsidered")
    )
    if competitor_rows:
        competitor_count = _competitor_label_from_count(len(competitor_rows))
        considering_build = False
    else:
        competitor_count, considering_build = competitor_label_and_build(alternatives)

    build_signal_raw = to_string_value(
        _first_present(payload, "build_vs_buy_signal", "buildVsBuySignal") or ""
    )
    build_signal = _build_vs_buy_from_signal(build_signal_raw)
    eng_raw = to_string_value(
        _first_present(payload, "customer_eng_headcount", "customerEngHeadcount") or ""
    )
    eng_cap = _capability_from_eng_headcount(eng_raw)
    if build_signal:
        considering_build, signal_cap = build_signal
        customer_technical_capability = eng_cap or signal_cap
    else:
        customer_technical_capability = eng_cap

    adv_rows = _advantage_rows(payload)
    key_advantages = structured_option_list(
        payload.get("key_advantages")
        if payload.get("key_advantages") is not None
        else payload.get("keyAdvantages")
    )
    if adv_rows:
        unique_differentiators = _differentiators_from_advantage_rows(adv_rows)
    elif key_advantages:
        unique_differentiators = []
        seen: set[str] = set()
        for chip in key_advantages:
            mapped = _advantage_type_from_label(chip)
            if not mapped or mapped in seen:
                continue
            seen.add(mapped)
            unique_differentiators.append({"advantageType": mapped})
            if len(unique_differentiators) >= 6:
                break
    else:
        unique_differentiators = []

    opp_years = _years_from_opportunity_type(
        to_string_value(
            _first_present(payload, "opportunity_type", "opportunityType") or ""
        )
    )
    years_in_sector = (
        opp_years if opp_years is not None else _years_in_customer_sector(payload)
    )

    approval = _approval_from_ownership(
        to_string_value(
            _first_present(payload, "customer_ownership", "customerOwnership") or ""
        )
    )

    systems_raw = _first_present(
        payload, "likely_integration_systems", "likelyIntegrationSystems"
    )
    integration_band = _integration_band_from_systems(systems_raw)
    if integration_band is None:
        integration_band = to_string_value(
            payload.get("integration_complexity") or payload.get("integrationComplexity")
        ) or None

    vendor_emp = _vendor_employee_count(payload)
    expects_larger = bool(
        customer_employee_count
        and vendor_emp
        and customer_employee_count > vendor_emp * 2
    )

    vendor_stage = _vendor_stage_for_formula(payload)

    other_risks = (
        payload.get("customer_specific_risks_other")
        if payload.get("customer_specific_risks_other") is not None
        else payload.get("customerSpecificRisksOther")
    )
    timeline_raw = to_string_value(
        payload.get("implementation_timeline") or payload.get("implementationTimeline")
    )
    vts_raw = _first_present(
        payload, "vendorTrustScore", "vendor_trust_score", "vts"
    )
    target_inds = _first_present(
        payload, "target_industries", "targetIndustries", "productTargetIndustries"
    )
    has_regs = any(
        k in payload and payload.get(k) is not None
        for k in ("regulatory_requirements", "regulatoryRequirements")
    )
    has_risks = any(
        k in payload and payload.get(k) is not None
        for k in ("customer_specific_risks", "customerSpecificRisks")
    )
    has_mitigations = any(
        k in payload and payload.get(k) is not None
        for k in ("risk_mitigation", "riskMitigation", "implementedMitigationCategories")
    )

    return {
        "customerRegulatoryRequirements": regulatory if has_regs else None,
        "_has_regulatory": has_regs,
        "_has_customer_specific_risks": has_risks,
        "sector": sector,
        "customerDataSensitivity": _safe_normalize(
            normalize_data_sensitivity_for_formula,
            to_string_value(
                payload.get("data_sensitivity") or payload.get("dataSensitivity")
            ),
            None,
            payload,
            "customerDataSensitivity",
        ),
        "customerRiskTolerance": _safe_normalize(
            normalize_risk_tolerance_for_formula,
            to_string_value(
                payload.get("customer_risk_tolerance")
                or payload.get("customerRiskTolerance")
            ),
            None,
            payload,
            "customerRiskTolerance",
        ),
        "customerSpecificRiskCount": len(customer_specific_risks) if has_risks else None,
        "customerType": customer_type,
        "customerHasUniqueRequirements": bool(to_string_list(other_risks)),
        "uniqueRequirementsList": to_string_list(other_risks),
        "likelyIntegrationSystems": to_string_list(systems_raw) if systems_raw is not None else [],
        "integrationPoints": (
            build_integration_points_for_formula(integration_band)
            if integration_band
            else []
        ),
        "customizationLevel": _safe_normalize(
            normalize_customization_for_formula,
            to_string_value(
                payload.get("customization_level") or payload.get("customizationLevel")
            ),
            None,
            payload,
            "customizationLevel",
        ),
        "targetUserFunctions": to_string_list(
            _first_present(payload, "target_user_function", "targetUserFunction")
        ),
        "implementationTimelineBand": timeline_raw or None,
        "implementationTimelineMonths": timeline_months_for_formula(timeline_raw),
        "proposedMitigationsCount": len(risk_mitigations) if has_mitigations else None,
        "implementedMitigationCategories": risk_mitigations if has_mitigations else [],
        "competitorCount": competitor_count,
        "competitorRows": competitor_rows,
        "buildVsBuySignal": build_signal_raw or None,
        "customerConsideringBuildVsBuy": considering_build,
        "customerTechnicalCapability": customer_technical_capability,
        "customerEngHeadcount": eng_raw or None,
        "budgetMidpoint": budget_midpoint,
        "customerAnnualRevenue": _first_present(
            payload, "customer_annual_revenue", "customerAnnualRevenue"
        ),
        "customerOwnership": _first_present(
            payload, "customer_ownership", "customerOwnership"
        ),
        "approvalLevels": approval,
        "uniqueDifferentiators": unique_differentiators,
        "yearsInCustomerSector": years_in_sector,
        "opportunityType": _first_present(payload, "opportunity_type", "opportunityType"),
        "vendorStage": vendor_stage,
        "customerExpectsLargerVendorFeatures": expects_larger,
        "customerEmployeeCount": customer_employee_count,
        "vendorEmployeeCount": vendor_emp,
        "vendorTrustScore": vts_raw,
        "customerCertifications": to_string_list(
            _first_present(payload, "customer_certifications", "customerCertifications")
        ),
        "customerPublicAiPolicy": _first_present(
            payload, "customer_public_ai_policy", "customerPublicAiPolicy"
        ),
        "customerAiLeadership": _first_present(
            payload, "customer_ai_leadership", "customerAiLeadership"
        ),
        "customerAiMaturityEvidence": to_string_list(
            _first_present(payload, "customer_ai_maturity_evidence", "customerAiMaturityEvidence")
        ),
        "customerPublicIncident": _first_present(
            payload, "customer_public_incident", "customerPublicIncident"
        ),
        "productTargetIndustries": (
            to_string_list(target_inds) if target_inds is not None else []
        ),
        "implementationApproach": _first_present(
            payload, "implementation_approach", "implementationApproach"
        ),
        "informationBasis": _first_present(
            payload, "information_basis", "informationBasis"
        ),
        "answerConfidence": _first_present(
            payload, "answer_confidence", "answerConfidence"
        ),
        "researchDate": _first_present(payload, "research_date", "researchDate"),
        "productFeatureMatchPct": _product_feature_match_pct(payload),
        "_degraded_fields": list(payload.get("_degraded_fields") or []),
    }


__all__ = [
    "build_sales_risk_formula_input",
    "calculate_sales_risk_score",
    "calc_control_coverage_gap",
    "calc_trust_gap_friction",
    "interpret_sales_risk_score",
    "calc_regulatory_complexity",
    "calc_data_sensitivity_friction",
    "calc_risk_tolerance_friction",
    "calc_customer_specific_risk_friction",
    "calculate_customer_friction_risk",
    "calc_integration_complexity",
    "calc_customization_required",
    "calc_timeline_pressure",
    "calc_feature_gap",
    "calc_mitigation_gap",
    "calculate_implementation_risk",
    "calc_competitive_alternatives",
    "calc_budget_constraint",
    "calc_competitive_advantage",
    "calc_vendor_buyer_maturity_gap",
    "calculate_competitive_risk",
    "to_string_value",
    "to_string_list",
    "regulatory_requirements_to_string_list",
    "normalize_sector_for_formula",
    "normalize_risk_tolerance_for_formula",
    "normalize_data_sensitivity_for_formula",
    "normalize_customization_for_formula",
    "build_integration_points_for_formula",
    "timeline_months_for_formula",
    "budget_for_formula",
    "customer_type_for_formula",
]
