"""Vendor Trust Score v2.0 — Documents 0 (ex-§7) and 1."""

from services.scoring_service import (
    CM_CLAMP,
    build_formula_input_from_payload,
    calc_certifications_score,
    calculate_combined_contextual_multiplier,
    calculate_confidence_factor,
    calculate_governance_risk,
    calculate_operational_risk,
    calculate_product_risk,
    calculate_vendor_trust_score,
    calc_stability_score,
)


def test_t1_01_governance_normalisation_excludes_absent_groups():
    result = calculate_governance_risk({
        "assessmentMethod": "third_party_audit",
        "auditFrequency": "annual",
        "dataRetentionPolicy": True,
        "dataRetentionPolicyCompleteness": "documented_and_enforced",
        "incidentResponsePlan": True,
        "incidentResponsePlanMaturity": "tested_annually",
        "privacyPolicy": True,
        "privacyPolicyScope": "comprehensive_gdpr_ccpa",
        "aiEthicsPolicy": False,
        "humanOversightCapabilities": "always_in_loop",
        "continuousMonitoring": "real_time_alerting",
        "modelVersionControl": True,
        "versioningMaturity": "automated_mlops_pipeline",
        "fundingStatus": "publicly_traded",
        "financialStatus": "profitable_3_years",
    })
    assert result["excluded_groups"]
    assert any(g["reason"] == "no_input" for g in result["excluded_groups"])
    assert result["attainable"] > 0
    ratio = min(1.0, result["earned"] / result["attainable"])
    expected = round(100 * (1 - ratio), 4)
    assert abs(result["value"] - expected) < 0.02


def test_t1_01_absent_fifth_group_does_not_deflate():
    four = calculate_governance_risk({
        "assessmentMethod": "internal_audit",
        "dataRetentionPolicy": True,
        "dataRetentionPolicyCompleteness": "documented_and_enforced",
        "humanOversightCapabilities": "always_in_loop",
        "fundingStatus": "series_b_c",
    })
    five_blank = calculate_governance_risk({
        "assessmentMethod": "internal_audit",
        "dataRetentionPolicy": True,
        "dataRetentionPolicyCompleteness": "documented_and_enforced",
        "humanOversightCapabilities": "always_in_loop",
        "fundingStatus": "series_b_c",
        "certificationsSearchBlob": "",
    })
    assert four["value"] == five_blank["value"]


def test_t1_06_product_risk_clamps_at_100():
    pr = calculate_product_risk(
        inherent_risk=100,
        mitigation_effectiveness=0,
        confidence_factor=1.20,
    )
    assert pr["value"] == 100.0


def test_t1_11_blank_retention_earns_nothing():
    score = calc_stability_score({"yearFounded": 2010, "financialStatus": "break_even"})
    assert score["customer_retention_points"] == 0


def test_t1_12_cm_chain_is_clamped():
    cm = calculate_combined_contextual_multiplier({
        "decisionAutonomyLevel": "fully_autonomous",
        "decisionStakeLevel": "Life-Critical",
        "impactScores": [5, 5, 5],
        "devStage": "production_mature",
        "assessmentPhase": "vendor_evaluation",
        "customizationLevel": "fully_custom",
        "integrationComplexity": "legacy_systems",
        "hostingType": ["edge_devices", "hybrid"],
        "employeeCount": "10000+",
        "geographicRegions": "global",
        "dataVolumeScale": "petabyte_scale",
        "intentionalRiskCount": 10,
        "unintentionalRiskCount": 0,
    })
    lo, hi = CM_CLAMP
    assert lo <= cm["value"] <= hi
    assert cm["architecture_multiplier"]["hosting_adj"] == 0.10


def test_t1_04_expired_cert_gets_no_cf_credit():
    cf = calculate_confidence_factor({
        "complianceDocumentationComplete": True,
        "certificationExpiryDate": "2020-01-01",
    })
    assert cf["value"] == 1.0


def test_t1_05_absent_pen_test_does_not_credit_cf():
    cf = calculate_confidence_factor({"independentPenTestFrequency": "none"})
    assert cf["value"] == 1.0


def test_vts_master_formula_runs():
    result = calculate_vendor_trust_score({
        "likelihoodScores": [3, 3, 3],
        "impactScores": [3, 3, 3],
        "decisionAutonomyLevel": "supervised",
        "decisionStakeLevel": "Moderate",
        "devStage": "production",
        "assessmentPhase": "vendor_evaluation",
        "customizationLevel": "lightly_customized",
        "integrationComplexity": "simple_api",
        "hostingType": "cloud_hosted",
        "employeeCount": "51-200",
        "geographicRegions": "national",
        "intentionalRiskCount": 1,
        "unintentionalRiskCount": 2,
        "applicableDomains": [
            {"domain": "Privacy and Security", "riskCount": 2},
            {"domain": "Unknown Catalogue Domain", "riskCount": 1},
        ],
        "sector": "Technology",
        "requiredCategories": [
            "Data Governance & Privacy Controls",
            "Access Management & Authentication",
        ],
        "implementedCategories": ["Data Governance & Privacy Controls"],
        "mitigations": [{"mitigationId": "m1", "riskCount": 2, "avgRelevance": 0.8}],
        "assessmentMethod": "third_party_review",
        "slaUptime": "99.9-99.95%",
    })
    assert result["scoring_version"] == "vts-2.1"
    assert 0 <= result["vendor_trust_score"] <= 100
    assert result["grade"] in {"A", "B", "C", "D", "F"}
    assert "risk_tolerance_multiplier" not in result["detail"]["product_risk"]["combined_contextual_multiplier"]
    coverage = result["detail"]["product_risk"]["mitigation_effectiveness"]["category_coverage"]
    assert "Access Management & Authentication" not in coverage["required_categories"]
    dw_domains = [row["domain"] for row in result["detail"]["product_risk"]["domain_weight"]["breakdown"]]
    assert "Unknown Catalogue Domain" in dw_domains


def test_operational_blank_group_excluded():
    ops = calculate_operational_risk({"slaUptime": "99.99%+"})
    reasons = {g["group"]: g["reason"] for g in ops["excluded_groups"]}
    assert reasons.get("support_score") == "no_input"
    # SLA attainable is the sum of its own line items (25 + 8 + 7), not a cap that
    # would discard the response and resolution commitments.
    assert ops["attainable"] == 40


def test_blank_payload_uses_neutral_missing_input_handling():
    formula = build_formula_input_from_payload({"_skipCategoryVector": True})
    assert formula["decisionAutonomyLevel"] == ""
    assert formula["devStage"] == ""
    assert formula["customizationLevel"] is None
    assert formula["integrationComplexity"] is None
    assert formula["hostingType"] is None
    assert formula["employeeCount"] is None
    assert formula["geographicRegions"] is None
    assert formula["intentionalRiskCount"] == 0
    assert formula["unintentionalRiskCount"] == 0
    assert formula["applicableDomains"] == []
    assert formula["planTesting"] == ""
    assert formula["supportsHipaaWorkflows"] is False
    assert formula["likelihood_score_source"] == "insufficient_evidence_pending_prior"


def test_unknown_timing_value_is_traced_instead_of_failing():
    cm = calculate_combined_contextual_multiplier({
        "decisionAutonomyLevel": None,
        "devStage": "not_in_registry",
        "assessmentPhase": "vendor_evaluation",
        "customizationLevel": None,
        "integrationComplexity": None,
        "hostingType": None,
        "employeeCount": None,
        "geographicRegions": None,
        "dataVolumeScale": None,
        "intentionalRiskCount": 0,
        "unintentionalRiskCount": 0,
    })
    assert cm["timing_multiplier"]["unmatched"] == [
        {"field": "devStage", "value": "not_in_registry"}
    ]
    assert cm["intent_multiplier"]["profile"] == "insufficient_evidence"


def test_certification_tier_uses_structured_evidence_not_nearby_text():
    claim = calc_certifications_score({
        "certificationsSearchBlob": "ISO 27001 independent audit report attached",
        "buyerIndustrySegment": "Technology",
    })
    current = calc_certifications_score({
        "certificationsSearchBlob": "ISO 27001",
        "buyerIndustrySegment": "Technology",
        "certificates": [{"name": "ISO 27001 certificate.pdf", "expiryDate": "2099-01-01"}],
    })
    expired = calc_certifications_score({
        "certificationsSearchBlob": "ISO 27001",
        "buyerIndustrySegment": "Technology",
        "certificates": [{"name": "ISO 27001 certificate.pdf", "expiryDate": "2020-01-01"}],
    })
    assert claim["iso_27001_points"] == 5
    assert current["iso_27001_points"] == 10
    assert expired["iso_27001_points"] == 0


MEASURED_VENDOR = {
    "likelihoodScores": [3, 3, 3],
    "impactScores": [3, 3, 3],
    "assessmentMethod": "third_party_audit",
    "auditFrequency": "annual",
    "certificationsSearchBlob": "soc 2 type 2 iso 27001",
    "buyerIndustrySegment": "technology & software",
    "certificates": [{"name": "ISO 27001 cert", "expiryDate": "2099-01-01"}],
    "dataRetentionPolicy": True,
    "dataRetentionPolicyCompleteness": "documented_and_enforced",
    "incidentResponsePlan": True,
    "incidentResponsePlanMaturity": "tested_annually",
    "privacyPolicy": True,
    "privacyPolicyScope": "comprehensive_gdpr_ccpa",
    "humanOversightCapabilities": "always_in_loop",
    "continuousMonitoring": "real_time_alerting",
    "fundingStatus": "series_d_plus",
    "financialStatus": "profitable_3_years",
    "encryptionAtRest": "aes_256",
    "tlsInTransit": "1.3",
    "dataSubjectRights": ["access", "erasure", "portability"],
    "subProcessors": [{"name": "AWS", "purpose": "hosting", "region": "us-east-1"}],
    "vulnerabilityDisclosurePolicy": {"status": "published", "url": "https://example.com/vdp"},
    "bugBounty": {"status": "public", "url": "https://example.com/bounty"},
    "dpaAvailable": "publicly_available",
    "slaUptime": "99.99%+",
    "criticalIncidentResponse": "< 1 hour",
    "criticalIncidentResolution": "< 24 hours",
    "planTesting": "annual_test",
    "rollbackProcedures": "automated_instant",
    "incidentCommunication": "proactive_status_page",
    "deploymentScale": "enterprise_multi_tenant",
    "multiTenancySupport": True,
    "isolationMethod": "full_instance_isolation",
    "yearFounded": 2010,
    "customerRetentionRate": 96,
    "supportTiers": "24_7_phone_chat_email",
    "technicalAccountManager": "dedicated_tam",
}


def test_master_formula_keeps_documented_pillar_weights():
    result = calculate_vendor_trust_score(dict(MEASURED_VENDOR))
    assert result["detail"]["final_formula"]["pillar_weights"] == {
        "product": 0.40,
        "governance": 0.30,
        "operational": 0.30,
    }


def test_unmeasured_pillar_is_dropped_not_stubbed():
    without_ri = dict(MEASURED_VENDOR)
    without_ri.pop("likelihoodScores")
    without_ri.pop("impactScores")
    result = calculate_vendor_trust_score(without_ri)
    final = result["detail"]["final_formula"]
    assert final["pillars_measured"]["product"] is False
    assert final["pillar_weights"]["product"] == 0.0
    assert final["pillar_weights"]["governance"] == 0.5
    assert final["pillar_weights"]["operational"] == 0.5


def test_factor_ledger_reconciles_with_the_published_score():
    """AIQ-065: every displayed deduction must reach the number printed above it."""
    result = calculate_vendor_trust_score(dict(MEASURED_VENDOR))
    detail = result["detail"]
    ledger = detail["factor_ledger"]
    assert ledger

    final = detail["final_formula"]
    contributions = {
        "Product": final["product_risk_contribution"],
        "Governance": final["governance_risk_contribution"],
        "Operational": final["operational_risk_contribution"],
    }
    category_scores = {
        "Product": 100 - result["product_risk"],
        "Governance": 100 - result["governance_risk"],
        "Operational": 100 - result["operational_risk"],
    }

    for category, contribution in contributions.items():
        rows = [r for r in ledger if r["category"] == category]
        if not rows:
            continue
        # Weighted impacts sum to the category's deduction from the trust score.
        assert abs(sum(r["score_impact"] for r in rows) - contribution) < 0.05
        # Unweighted impacts sum to the category score deficit.
        assert abs(sum(r["category_impact"] for r in rows) - (100 - category_scores[category])) < 0.05

    total = sum(r["score_impact"] for r in ledger)
    assert abs(total - (100 - result["vendor_trust_score"])) < 0.05


def test_no_line_item_is_unreachable():
    """A factor a vendor can never earn would show a permanent phantom deduction."""
    result = calculate_vendor_trust_score(dict(MEASURED_VENDOR))
    for row in result["detail"]["factor_ledger"]:
        assert row["attainable"] > 0, row["key"]


def test_earned_points_are_never_discarded():
    """Sub-scores must not be clipped by a group cap below their own maximum."""
    gov = calculate_governance_risk(dict(MEASURED_VENDOR))
    ops = calculate_operational_risk(dict(MEASURED_VENDOR))
    for pillar in (gov, ops):
        for group in pillar["included_groups"]:
            assert group["earned"] <= group["attainable"] + 1e-9


def test_full_evidence_separates_from_near_full_evidence():
    """Good vendors must not compress onto the same score (AIQ Phase 1, item 2)."""
    strong = calculate_vendor_trust_score(dict(MEASURED_VENDOR))
    slightly_weaker = dict(MEASURED_VENDOR)
    slightly_weaker["customerRetentionRate"] = 72
    slightly_weaker["criticalIncidentResolution"] = "> 72 hours"
    weaker = calculate_vendor_trust_score(slightly_weaker)
    assert strong["vendor_trust_score"] > weaker["vendor_trust_score"]
    assert round(strong["vendor_trust_score"]) != round(weaker["vendor_trust_score"])
