"""Implementation Readiness Score v2.0 — Documents 0 and 3."""

from services.buyer_implementation_risk_formula import (
    calculate_buyer_implementation_risk_score,
)


def _leaf(result, pillar, name):
    parts = result["detail"][pillar]["components"]
    return next(c for c in parts if c["name"] == name)


def test_t3_03_no_attestation_base_is_50_times_rtm():
    result = calculate_buyer_implementation_risk_score(
        {"riskAppetite": "Moderate - Balanced innovation and risk management"},
        None,
        "V",
        "P",
    )
    base = _leaf(result, "vendor_risk", "base")
    assert base["vendor_trust_score"] == 50.0
    assert base["default_disclosed"] is True
    assert abs(base["value"] - 50.0) < 0.02


def test_t3_04_very_low_appetite_vts_80_base_25():
    result = calculate_buyer_implementation_risk_score(
        {"riskAppetite": "Very Low - Zero tolerance, extensive validation required"},
        {"latest_trust_score": 80},
        "V",
        "P",
    )
    base = _leaf(result, "vendor_risk", "base")
    assert abs(base["value"] - 25.0) < 0.02
    assert base["rtm"]["value"] == 1.25


def test_t3_05_two_disputes_add_10_to_vr():
    result = calculate_buyer_implementation_risk_score(
        {
            "riskAppetite": "Moderate - Balanced innovation and risk management",
            "monitoringDataStance": "Dispute",
            "dataExportStance": "Dispute",
        },
        {"latest_trust_score": 50},
        "V",
        "P",
    )
    assert result["breakdown"]["disputeAdjustment"] == 10.0


def test_t3_06_on_premise_required_saas_only_fit_30():
    result = calculate_buyer_implementation_risk_score(
        {
            "deploymentModel": "On-premise required",
            "vendorHosting": "SaaS only (cloud-hosted)",
        },
        None,
        "V",
        "P",
    )
    fit = _leaf(result, "integration_risk", "deployment_fit")
    assert abs(fit["value"] - 30.0) < 0.02


def test_t3_07_blank_rollback_is_excluded():
    result = calculate_buyer_implementation_risk_score({}, None, "V", "P")
    rb = _leaf(result, "integration_risk", "rollback")
    assert rb["included"] is False
    assert rb["reason"] == "no_input"


def test_t3_08_six_admin_systems_average_plus_count_penalty():
    systems = [
        "EHR / EMR Systems",
        "ERP (SAP, Oracle, etc.)",
        "Financial Systems",
        "HR Systems (Workday, ADP, etc.)",
        "CRM (Salesforce, HubSpot, etc.)",
        "Identity Management / SSO (Okta, Azure AD)",
    ]
    access = {s: "Admin" for s in systems}
    result = calculate_buyer_implementation_risk_score(
        {"integrationSystems": systems, "integrationAccessLevels": access},
        None,
        "V",
        "P",
    )
    tech = _leaf(result, "integration_risk", "technical")
    expected_avg = (30 + 25 + 22 + 15 + 12 + 5) / 6 * 1.5
    assert abs(tech["average"] - expected_avg) < 0.05
    assert tech["count_penalty"] == 6
    assert abs(tech["value"] - (expected_avg + 6)) < 0.05


def test_t3_09_budget_excluded_without_vendor_acv():
    result = calculate_buyer_implementation_risk_score(
        {"budgetRange": "Under $50K"},
        None,
        "V",
        "P",
    )
    budget = _leaf(result, "organizational_readiness_gap", "budget_realism")
    assert budget["included"] is False


def test_t3_10_no_airi_record_scores_zero_with_note():
    result = calculate_buyer_implementation_risk_score({}, None, "V", "P")
    track = _leaf(result, "vendor_risk", "track_record")
    assert track["included"] is True
    assert track["value"] == 0.0
    assert "no public record" in (track.get("note") or track.get("reason") or "")


def test_t3_11_autonomous_use_case_advisory_vendor():
    result = calculate_buyer_implementation_risk_score(
        {
            "useCaseTypes": ["Take an action automatically"],
            "vendorDecisionAutonomy": "advisory",
            "vendorAiCapabilities": ["content generation"],
        },
        None,
        "V",
        "P",
    )
    gap = _leaf(result, "integration_risk", "use_case_gap")
    assert gap["autonomy_penalty"] == 15.0


def test_t3_12_blocker_does_not_change_score():
    payload = {
        "deploymentModel": "On-premise required",
        "vendorHosting": "cloud-hosted saas",
        "riskAppetite": "Moderate - Balanced innovation and risk management",
    }
    flagged = calculate_buyer_implementation_risk_score(payload, None, "V", "P")
    assert any(b["id"] == "deployment_model_impossible" for b in flagged["detail"]["blockers"])
    assert flagged["decision"] == "Flagged as a high risk"


def test_t3_residency_blocker_does_not_use_airi():
    payload = {
        "dataSubjectJurisdictions": ["EU/EEA"],
        "vendorResidencyOptions": ["United States"],
        "vendorHosting": "SaaS only (cloud-hosted)",
        "riskAppetite": "Moderate - Balanced innovation and risk management",
    }
    result = calculate_buyer_implementation_risk_score(payload, None, "V", "P")
    assert any(b["id"] == "data_residency_impossible" for b in result["detail"]["blockers"])
    assert result["decision"] == "Flagged as a high risk"
    assert 0 <= result["implementationRiskScore"] <= 100
    track = _leaf(result, "vendor_risk", "track_record")
    assert track["value"] == 0.0
