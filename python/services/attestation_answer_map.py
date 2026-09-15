"""Map stored vendor-attestation answers onto VTS formula lookup keys.

The questionnaire stores two value styles: newer questions store the formula key
directly (``daily_dashboard``), older ones store the display label
(``"99.9% (8.8 hrs/year)"``). Formula lookups are exact-match, so labels have to be
translated here or the answer silently scores zero.

Keep in sync with backend/src/utils/attestationAnswerMap.ts.
"""

from __future__ import annotations

from typing import Any

# --- Older questions: display label -> formula key -------------------------------

UPTIME_SLA = {
    "99.99% (52 min/year downtime)": "99.99%+",
    "99.95% (4.4 hrs/year)": "99.95-99.99%",
    "99.9% (8.8 hrs/year)": "99.9-99.95%",
    "99.5% (1.8 days/year)": "99.5-99.9%",
    "99.0% (3.7 days/year)": "99.0-99.5%",
    "95.0% (18 days/year)": "95.0-99.0%",
    "< 95% or No SLA": "< 95%",
}

DEPLOYMENT_SCALE = {
    "Pilot/POC (<100 users)": "pilot",
    "Small Business (<1,000 users)": "small_business",
    "Mid-Market (1,000-10,000 users)": "mid_market",
    "Enterprise single-tenant": "enterprise_single_tenant",
    "Enterprise multi-tenant (10,000+ users)": "enterprise_multi_tenant",
}

PRODUCT_STAGE = {
    "Design/Planning": "design",
    "Development/Alpha": "development",
    "Beta Testing": "testing",
    "Production (< 1 year)": "production_new",
    "Production Mature (1+ years)": "production_mature",
}

ROLLBACK_CAPABILITY = {
    "Automated instant rollback": "automated_instant",
    "Automated with manual trigger": "automated_manual_trigger",
    "Manual with documented procedures": "manual_documented",
    "Manual without documentation": "manual_undocumented",
    "No rollback capability": "none",
}

# Ordered strongest -> weakest; human_oversight is multi-select, take the strongest.
HUMAN_OVERSIGHT_RANKED = [
    ("Human-in-the-loop for all decisions", "always_in_loop"),
    ("Human monitoring with intervention", "monitoring_with_intervention"),
    ("Alert system for edge cases", "monitoring_only"),
    ("Audit logs for review", "monitoring_only"),
    ("Feedback mechanisms for users", "monitoring_only"),
    ("No specific oversight mechanisms", "none"),
]

# Canonical vocabulary is calculate_confidence_factor's (it raises on unknown values).
ASSESSMENT_METHOD = {
    "Third-party independent audit": "third_party_audit",
    "Third-party review (not full audit)": "third_party_review",
    "Internal audit by compliance team": "internal_audit",
    "Self-reported with verification": "self_reported_verified",
    "Self-reported without verification": "self_reported_unverified",
}

AUDIT_FREQUENCY = {
    "Quarterly": "annual",
    "Bi-annually": "annual",
    "Annually": "annual",
    "Every 2 years": "bi_annual",
    "As required by regulators/customers": "ad_hoc",
    "Not independently audited": "ad_hoc",
}

INCIDENT_RESPONSE_PLAN_MATURITY = {
    "Yes, tested quarterly": "tested_annually",
    "Yes, tested annually": "tested_annually",
    "Yes, documented but not tested": "documented_not_tested",
    "In development": "basic_runbook",
}

PII_STAKE_LEVEL = {
    "No PII (Anonymous data only)": "Low",
    "Minimal (Non-sensitive identifiers)": "Low",
    "Moderate (Names, emails, addresses)": "Moderate",
    "Extensive (Financial data, SSN, health info)": "High",
    "Critical (PHI, biometric data, children's data)": "Critical",
}

PII_HANDLING = {
    "No PII (Anonymous data only)": "none",
    "Minimal (Non-sensitive identifiers)": "minimal",
    "Moderate (Names, emails, addresses)": "moderate",
    "Extensive (Financial data, SSN, health info)": "extensive",
    "Critical (PHI, biometric data, children's data)": "critical",
}

# Newer questions store snake_case keys already, but on a different scale than the
# formula's; both lists are ordinal so they map position-for-position.
DEPLOYMENT_CUSTOMIZATION = {
    "none": "off_the_shelf",
    "configuration_only": "lightly_customized",
    "light_customization": "moderately_customized",
    "significant_customization": "heavily_customized",
    "heavy_custom_development": "fully_custom",
}

INTEGRATION_COMPLEXITY = {
    "none": "standalone",
    "simple": "simple_api",
    "standard": "moderate_integration",
    "complex": "complex_integration",
    "highly_complex": "legacy_systems",
}


def as_answer(value: Any) -> str:
    return str(value or "").strip()


def lookup(table: dict[str, str], value: Any, fallback: str) -> str:
    """Exact match, then case-insensitive, then the key itself if already canonical."""
    answer = as_answer(value)
    if not answer:
        return fallback
    if answer in table:
        return table[answer]
    lowered = answer.lower()
    for key, mapped in table.items():
        if key.lower() == lowered:
            return mapped
    if answer in table.values():
        return answer
    if lowered in table.values():
        return lowered
    return fallback


def passthrough(value: Any, allowed: set[str], fallback: str) -> str:
    """For questions whose stored values are already formula keys."""
    answer = as_answer(value).lower()
    return answer if answer in allowed else fallback


def strongest_human_oversight(value: Any) -> str:
    selected = value if isinstance(value, list) else ([value] if value else [])
    chosen = {as_answer(item) for item in selected if as_answer(item)}
    if not chosen:
        return "none"
    for label, key in HUMAN_OVERSIGHT_RANKED:
        if label in chosen:
            return key
    return "none"


def yes_no(value: Any, *, default: bool | None = None) -> bool | None:
    answer = as_answer(value).lower()
    if answer in ("yes", "true", "y"):
        return True
    if answer in ("no", "false", "n"):
        return False
    return default


def decision_autonomy_level(value: Any) -> str:
    answer = as_answer(value).lower()
    if not answer:
        return ""
    if "fully" in answer and "autonom" in answer:
        return "fully_autonomous"
    if "autonom" in answer:
        return "autonomous"
    if "assist" in answer:
        return "assisted"
    if "advis" in answer:
        return "advisory"
    return ""


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(str(value).strip())
    except (TypeError, ValueError):
        return fallback
    return n if n == n else fallback


# --- Cross-field guards (AIQ-078, interim) ----------------------------------------
# Two question pairs overlap: the incident_response_plan ladder already encodes the
# test cadence that ir_plan_test_frequency asks again, and adversarial_security_testing
# already claims what independent_pen_test_frequency asks again. Both halves of each
# pair now feed the score, so contradictory answers must resolve to the weaker claim
# instead of earning points from both sides. A blank answer is not a claim and never
# downgrades the other half.

_IR_TESTING_CLAIMS = {"quarterly_drills", "annual_test"}


def reconcile_ir_plan(plan_answer: Any, frequency_answer: Any) -> tuple[str | None, str]:
    """Return (incidentResponsePlanMaturity, planTesting), contradictions downgraded."""
    maturity = lookup(INCIDENT_RESPONSE_PLAN_MATURITY, plan_answer, "") or None
    testing = passthrough(
        frequency_answer, {"quarterly_drills", "annual_test", "documented_untested"}, ""
    )
    plan_claims_tested = maturity == "tested_annually"
    if plan_claims_tested and testing == "documented_untested":
        maturity = "documented_not_tested"
    if testing in _IR_TESTING_CLAIMS and as_answer(plan_answer) and not plan_claims_tested:
        testing = "documented_untested"
    # A completely unanswered pair is absent, not an untested plan.
    return maturity, testing or ("documented_untested" if as_answer(plan_answer) else "")


_PEN_TEST_CADENCE_CLAIMS = {"continuous", "quarterly", "annually", "ad_hoc"}
_SECURITY_TESTING_DENIALS = {"no testing conducted", "planned but not completed"}


def reconcile_pen_testing(security_testing_answer: Any, cadence_answer: Any) -> tuple[bool, str]:
    """Return (penetrationTestReportAvailable, independentPenTestFrequency).

    Only a "Yes, ..." security-testing answer counts as a completed test — bare text
    is not evidence — and an explicit denial cancels any pen-test cadence credit.
    """
    testing = as_answer(security_testing_answer).lower()
    cadence = as_answer(cadence_answer).lower()
    if testing in _SECURITY_TESTING_DENIALS and cadence in _PEN_TEST_CADENCE_CLAIMS:
        cadence = "none"
    report_available = testing.startswith("yes") or cadence in _PEN_TEST_CADENCE_CLAIMS
    return report_available, cadence


_SECTOR_BUCKETS = ("private_sector", "public_sector", "non_profit_sector")
_VTS_SECTORS = {
    "Healthcare",
    "Financial Services",
    "Autonomous Vehicles",
    "Government",
    "E-Commerce",
    "Technology",
}


def flatten_sector_labels(raw: Any) -> list[str]:
    """Unwrap type-01 `{ private_sector: [...] }` (or JSON string) into industry labels."""
    if raw is None:
        return []
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if text.startswith("{") or text.startswith("["):
            try:
                import json

                return flatten_sector_labels(json.loads(text))
            except (TypeError, ValueError):
                return []
        return [text]
    if isinstance(raw, list):
        out: list[str] = []
        for item in raw:
            out.extend(flatten_sector_labels(item))
        return out
    if isinstance(raw, dict):
        out: list[str] = []
        for key in _SECTOR_BUCKETS:
            if key in raw:
                out.extend(flatten_sector_labels(raw[key]))
        if not out:
            for value in raw.values():
                out.extend(flatten_sector_labels(value))
        return out
    return []


def vts_sector_from_labels(labels: list[str]) -> str:
    blob = " ".join(labels).lower()
    if not blob.strip():
        return "Technology"
    if any(tok in blob for tok in ("health", "pharma", "hospital", "payer", "clinical", "medical")):
        return "Healthcare"
    if any(tok in blob for tok in ("financial", "bank", "insurance", "fintech", "investment")):
        return "Financial Services"
    if "autonom" in blob:
        return "Autonomous Vehicles"
    if any(tok in blob for tok in ("government", "federal", "public sector", "defense")):
        return "Government"
    if "e-commerce" in blob or "ecommerce" in blob or "retail" in blob:
        return "E-Commerce"
    if any(tok in blob for tok in ("technolog", "software", "it services")):
        return "Technology"
    return "Technology"


def vts_sector_from_value(raw: Any) -> str:
    if isinstance(raw, str) and raw.strip() in _VTS_SECTORS:
        return raw.strip()
    return vts_sector_from_labels(flatten_sector_labels(raw))


def first_industry_segment(raw: Any) -> str:
    labels = flatten_sector_labels(raw)
    return labels[0] if labels else ""