"""Regression maps for AI-Q scoring tickets (AIQ-019/020/027/034–043 cluster)."""

from services.sales_risk_formula import (
    budget_for_formula,
    competitor_label_and_build,
    normalize_customization_for_formula,
    normalize_data_sensitivity_for_formula,
    normalize_risk_tolerance_for_formula,
    normalize_sector_for_formula,
    structured_option_list,
    timeline_months_for_formula,
    to_string_list,
)
from services.scoring_service import band_employee_count, band_geographic_regions


def test_employee_count_comma_thousands_does_not_fall_to_1_10():
    assert band_employee_count("1,001-5,000") == "1001-5000"
    assert band_employee_count("1,001–5,000") == "1001-5000"
    assert band_employee_count("10,000+") == "10000+"
    assert band_employee_count("5,001–10,000") == "5001-10000"
    assert band_employee_count("1–10") == "1-10"


def test_global_operating_region_outranks_array_length():
    assert band_geographic_regions(["Global (All regions)"]) == "global"
    assert band_geographic_regions(["Global (all regions)"]) == "global"
    assert band_geographic_regions(["United States", "Europe (EU)"]) == "national"


def test_public_sensitivity_is_low_not_high():
    assert (
        normalize_data_sensitivity_for_formula("Public - No Sensitive Data")
        == "Public"
    )
    assert (
        normalize_data_sensitivity_for_formula(
            "Highly Sensitive - PHI, Financial Records, or PCI Data"
        )
        == "Highly_Sensitive"
    )


def test_low_risk_averse_is_not_very_low():
    assert (
        normalize_risk_tolerance_for_formula(
            "Low - Risk-averse, prefers conservative approach"
        )
        == "Conservative"
    )
    assert (
        normalize_risk_tolerance_for_formula(
            "Very Low - Zero tolerance for risk, extensive controls required"
        )
        == "Very_Low"
    )


def test_unknown_budget_is_conservative_not_enterprise():
    assert budget_for_formula("") is None
    assert budget_for_formula("Not Yet Determined") == "Not known"
    assert budget_for_formula("Not known - estimate only") == "Not known"
    assert budget_for_formula("$5M - $10M") == "$5M-$10M"
    assert budget_for_formula("Over $10M") == "> $10M"
    assert budget_for_formula("$1M - $5M") == "$1M-$5M"


def test_customization_tiers_are_distinct():
    assert normalize_customization_for_formula(
        "Significant - Custom Model Training Required"
    ) == "Significant (custom model training)"
    assert normalize_customization_for_formula(
        "Extensive - Major Product Modifications"
    ) == "Extensive (significant dev)"
    assert normalize_customization_for_formula("unmatched gibberish") is None


def test_sector_does_not_default_technology():
    assert normalize_sector_for_formula("Energy & Utilities") == "Other"
    assert normalize_sector_for_formula("Financial Services - Banking") == "Financial_Services"
    assert normalize_sector_for_formula("Healthcare - Payers (Insurance)") == "Healthcare"
    assert normalize_sector_for_formula("Autonomous warehouse robots") == "Autonomous_Systems"


def test_none_chips_do_not_count_as_risks():
    assert to_string_list(["None Identified"]) == []
    assert to_string_list(["Data Privacy Concerns", "None Identified"]) == [
        "Data Privacy Concerns"
    ]


def test_key_advantages_do_not_score_comma_prose():
    prose = "Faster deployment, lower TCO, and domain expertise in healthcare"
    assert structured_option_list(prose) == [prose]


def test_rebuild_does_not_trigger_build_vs_buy():
    label, build = competitor_label_and_build("rebuild internal tools")
    assert build is False
    label2, build2 = competitor_label_and_build("build vs buy")
    assert build2 is True
    sole, _ = competitor_label_and_build("sole source")
    assert sole == "0 (sole source)"
    four, _ = competitor_label_and_build("A, B, C, D")
    assert four == "4+ competitors"


def test_exploratory_timeline_is_not_low_pressure_default():
    assert timeline_months_for_formula("Exploratory/No Specific Timeline") == 0
    assert timeline_months_for_formula("unknown") is None
    assert timeline_months_for_formula("Immediate (< 30 days)") == 1


def _vts_input(**answers):
    from services.scoring_service import build_formula_input_from_payload

    payload = {"_skipCategoryVector": True, **answers}
    return build_formula_input_from_payload(payload)


def test_aiq019_blank_uptime_does_not_beat_a_real_answer():
    from services.scoring_service import calc_sla_score

    blank = calc_sla_score(_vts_input())
    answered = calc_sla_score(_vts_input(uptime_sla="99.9% (8.8 hrs/year)"))
    no_sla = calc_sla_score(_vts_input(uptime_sla="< 95% or No SLA"))
    assert blank["uptime_points"] == 0
    assert blank["has_input"] is False
    assert no_sla["uptime_points"] == 3
    assert answered["uptime_points"] > blank["uptime_points"]
    assert answered["uptime_points"] > no_sla["uptime_points"]


def test_aiq021_unanswered_and_no_ethics_do_not_score_as_yes():
    assert _vts_input()["aiEthicsPolicy"] is None
    assert _vts_input(documented_ai_governance_policy="No")["aiEthicsPolicy"] is False
    assert _vts_input(documented_ai_governance_policy="Yes")["aiEthicsPolicy"] is True


def test_aiq022_no_is_not_truthy_for_policy_gates():
    no_payload = _vts_input(
        data_retention_policy="No",
        versions_models="No",
        is_multi_tenant="No",
        privacy_programme_scope="",
        incident_response_plan="",
    )
    assert no_payload["dataRetentionPolicy"] is False
    assert no_payload["modelVersionControl"] is False
    assert no_payload["multiTenancySupport"] is False
    assert no_payload["privacyPolicy"] is None
    assert no_payload["incidentResponsePlan"] is None
    yes_payload = _vts_input(data_retention_policy="Yes")
    assert yes_payload["dataRetentionPolicy"] is True


def test_aiq023_assessment_method_is_not_hardcoded_internal_audit():
    blank = _vts_input()
    assert blank["assessmentMethod"] is None
    mapped = _vts_input(assessment_completion_level="Third-party independent audit")
    assert mapped["assessmentMethod"] == "third_party_audit"


def test_aiq026_rollback_and_work_stops_raises_blocker():
    from services.buyer_implementation_risk_formula import calculate_buyer_implementation_risk_score

    result = calculate_buyer_implementation_risk_score(
        {
            "rollbackCapability": "None - No rollback capability, forward-only",
            "unavailabilityImpact": "Work stops - no manual alternative",
        },
        None,
        "V",
        "P",
    )
    ids = [b["id"] for b in result["detail"]["blockers"]]
    assert "no_rollback_and_work_stops" in ids
    assert result["decision"] == "Flagged as a high risk"


def test_type03_uses_new_cots_fields_instead_of_hardcoded():
    from services.buyer_implementation_risk_formula import (
        calculate_buyer_implementation_risk_score,
    )

    weak = calculate_buyer_implementation_risk_score(
        {
            "implementationCapacity": "No one assigned yet",
            "currentUsageState": "Not in use - manual process today",
            "humanReviewLevel": "No review - used directly",
            "decisionStakes": "Life or Death - Medical decisions, safety-critical applications",
            "riskAppetite": "Very High - Innovation-first, minimal risk concerns",
            "unavailabilityImpact": "Work stops - no manual alternative",
            "dataSensitivity": "Highly Sensitive - PHI, financial records, or PCI data",
            "integrationSystems": ["EHR / EMR Systems", "ERP (SAP, Oracle, etc.)"],
            "integrationAccessLevels": {"EHR / EMR Systems": "Admin"},
            "pilotStatus": "Not planned",
            "usersInScope": "5,000+",
            "vendorEvidenceReceived": ["Nothing yet"],
            "dataExportCapability": "No - data cannot be exported",
            "aiGovernanceMaturity": "None (No formal AI governance policies)",
            "dataGovernanceMaturity": "Ad-hoc (Minimal or no formal data policies)",
            "aiSkillsAvailability": "None (No AI/ML expertise)",
        },
        None,
        "V",
        "P",
    )
    strong = calculate_buyer_implementation_risk_score(
        {
            "implementationCapacity": "Dedicated team assigned",
            "currentUsageState": "Officially in use, expanding",
            "humanReviewLevel": "Always - reviewed by domain experts",
            "decisionStakes": "Low Impact - Minor inconvenience or rework required",
            "riskAppetite": "Low - Conservative, prefer proven solutions",
            "unavailabilityImpact": "Additive only - nothing depends on it yet",
            "dataSensitivity": "Public - No sensitive data",
            "integrationSystems": ["No Integrations Required"],
            "pilotStatus": "Completed - met criteria",
            "usersInScope": "1-10 (pilot)",
            "vendorEvidenceReceived": [
                "SOC 2 Type 2 report",
                "ISO 27001 certificate",
                "Model or safety testing results",
            ],
            "monitoringDataAvailable": "Yes - Comprehensive analytics and dashboards",
            "auditLogsAvailable": "Yes - Comprehensive audit logs with retention",
            "dataExportCapability": "Yes - full export in standard formats",
            "aiGovernanceMaturity": "Advanced (Comprehensive AI governance with board oversight)",
            "dataGovernanceMaturity": "Optimized (Comprehensive data governance program)",
            "aiSkillsAvailability": "Expert (10+ person AI/ML team)",
        },
        None,
        "V",
        "P",
    )
    assert strong["implementationRiskScore"] > weak["implementationRiskScore"]
    assert weak["breakdown"]["organizationalReadinessGap"] > strong["breakdown"][
        "organizationalReadinessGap"
    ]
    assert weak["breakdown"]["integrationRisk"] > strong["breakdown"]["integrationRisk"]


def test_type03_attestation_fills_rollback_instead_of_hardcoded():
    from services.buyer_implementation_risk_formula import (
        calculate_buyer_implementation_risk_score,
    )

    no_data = calculate_buyer_implementation_risk_score({}, None, "V", "P")
    from_attestation = calculate_buyer_implementation_risk_score(
        {},
        {"rollback_capability": "No rollback capability"},
        "V",
        "P",
    )

    def rollback(result):
        return next(
            c
            for c in result["detail"]["integration_risk"]["components"]
            if c["name"] == "rollback"
        )

    assert rollback(no_data)["included"] is False
    assert rollback(from_attestation)["included"] is True
    assert rollback(from_attestation)["value"] > 0
    assert from_attestation["breakdown"]["integrationRisk"] is not None



def test_aiq045_srs_inputs_are_not_hardcoded():
    from services.sales_risk_formula import build_sales_risk_formula_input

    built = build_sales_risk_formula_input(
        {
            "year_founded": 2018,
            "vendorMaturity": "Growth Stage - Scaling customer base",
            "employeeCount": "1,001-5,000",
            "keyAdvantages": ["a", "b", "c"],
        }
    )
    assert built["vendorStage"] == "growth"
    assert built["yearsInCustomerSector"] >= 5
    assert built["productFeatureMatchPct"] != 80 or built["vendorEmployeeCount"] != 250


def test_type02_uses_new_cots_fields_instead_of_hardcoded():
    from services.sales_risk_formula import (
        build_sales_risk_formula_input,
        calculate_sales_risk_score,
    )

    small = build_sales_risk_formula_input(
        {
            "customer_employee_count": "1-50",
            "opportunity_type": "New logo",
            "competitors": [{"name": "Acme", "incumbent": "No", "basis": "Market inference"}],
            "build_vs_buy_signal": "No signal",
            "key_advantages_rows": [{"advantage": "Faster rollout in healthcare", "category": "Product"}],
            "likely_integration_systems": ["Identity / SSO"],
            "customer_eng_headcount": "Under 50",
            "customer_ownership": "Founder / family owned",
            "customerBudgetRange": "Over $10M",
            "alternatives_considered": "rebuild in-house UiPath",
        }
    )
    large = build_sales_risk_formula_input(
        {
            "customer_employee_count": "50,000+",
            "opportunity_type": "Renewal",
            "competitors": [
                {"name": "A", "incumbent": "Yes", "basis": "Publicly confirmed"},
                {"name": "B", "incumbent": "No", "basis": "Market inference"},
                {"name": "C", "incumbent": "No", "basis": "Market inference"},
                {"name": "D", "incumbent": "No", "basis": "Market inference"},
            ],
            "build_vs_buy_signal": "Yes - public evidence of internal build",
            "key_advantages_rows": [{"advantage": "SOC 2 already in product", "category": "Compliance"}],
            "likely_integration_systems": [
                "Identity / SSO",
                "Code hosting",
                "CI/CD",
                "Ticketing (Jira, ServiceNow)",
                "Data warehouse",
            ],
            "customer_eng_headcount": "5,000+",
            "customer_ownership": "Publicly traded",
            "customer_ai_maturity_evidence": [
                "Named AI/ML leadership in post",
                "AI product shipped publicly",
                "Actively hiring AI/ML roles",
            ],
            "employeeCount": "11-50",
        }
    )

    assert small["customerEmployeeCount"] == 25
    assert large["customerEmployeeCount"] == 75000
    assert small["customerType"] == "SMB"
    assert large["customerType"] == "Enterprise"
    assert small["yearsInCustomerSector"] == 0
    assert large["yearsInCustomerSector"] == 5
    assert small["competitorCount"] == "1 competitor"
    assert large["competitorCount"] == "4+ competitors"
    assert small["customerConsideringBuildVsBuy"] is False
    assert large["customerConsideringBuildVsBuy"] is True
    assert small["customerTechnicalCapability"] == "Weak (unlikely to build)"
    assert large["customerTechnicalCapability"] == "Strong (can build)"
    assert small["uniqueDifferentiators"][0]["advantageType"] == "Product"
    assert large["uniqueDifferentiators"][0]["advantageType"] == "Compliance"
    assert small["approvalLevels"] == "VP_and_below"
    assert large["approvalLevels"] == "Board_approval"
    assert len(small["likelyIntegrationSystems"]) == 1
    assert len(large["likelyIntegrationSystems"]) >= 4
    assert large["vendorStage"] is None
    assert small["proposedMitigationsCount"] is None

    srs_small = calculate_sales_risk_score(small)["sales_risk_score"]
    srs_large = calculate_sales_risk_score(large)["sales_risk_score"]
    assert srs_small != srs_large


def test_type01_nested_sector_maps_to_healthcare_not_technology():
    payload = _vts_input(
        companyProfile={
            "sector": {
                "private_sector": ["Healthcare - Payers (Insurance)"],
                "public_sector": [],
            },
            "operatingRegions": ["United States", "Europe (EU)", "Asia Pacific"],
        },
        pii_handling="Critical (PHI, biometric data, children's data)",
    )
    assert payload["sector"] == "Healthcare"
    assert payload["decisionStakeLevel"] == "Critical"
    assert payload["geographicRegions"] == "multi_national"
    assert payload["supportsHipaaWorkflows"] is False


def test_type01_json_string_sector_and_operate_regions_alias():
    payload = _vts_input(
        target_industries='{"private_sector": ["Financial Services - Banking"]}',
        operate_regions=["Global (All regions)"],
    )
    assert payload["sector"] == "Financial Services"
    assert payload["geographicRegions"] == "global"


def test_aiq048_unknown_formula_enum_is_degraded_not_crash():
    from services.sales_risk_formula import calculate_sales_risk_score

    result = calculate_sales_risk_score(
        {
            "customerType": "not-a-real-type",
            "sector": "???",
            "customerDataSensitivity": "mystery",
            "customerRiskTolerance": "mystery",
            "customizationLevel": "mystery",
            "competitorCount": "mystery",
            "budgetMidpoint": "mystery",
            "approvalLevels": "mystery",
            "vendorStage": "mystery",
            "customerRegulatoryRequirements": [],
            "customerSpecificRiskCount": 0,
            "integrationPoints": [],
            "customerRequiresIndustryWorkflows": False,
            "businessProcessChangesRequired": 0,
            "implementationTimelineMonths": 6,
            "regulatoryDeadlineExists": False,
            "productFeatureMatchPct": 50,
            "missingCriticalFeatures": [],
            "proposedMitigationsCount": 0,
            "avgMitigationsPerRisk": 0,
            "customerConsideringBuildVsBuy": False,
            "uniqueDifferentiators": [],
            "yearsInCustomerSector": 0,
            "customerExpectsLargerVendorFeatures": False,
            "customerEmployeeCount": 100,
            "vendorEmployeeCount": 50,
        }
    )
    assert result["scoring_source"] == "degraded"
    assert 0 <= result["sales_risk_score"] <= 100


def test_doc2_pillar_normalisation_t2_01():
    from services.sales_risk_formula import _normalise_risk_pillar, CFR_ATTAINABLE

    result = _normalise_risk_pillar(
        [
            ("regulatory_complexity", {"value": 70}, True),
            ("data_sensitivity_friction", {"value": 50}, True),
            ("risk_tolerance_friction", {"value": 0}, True),
            ("customer_specific_risk_friction", {"value": 0}, True),
            ("trust_gap_friction", {"value": 0}, False),
            ("sector_risk_climate", {"value": 0}, False),
        ],
        CFR_ATTAINABLE,
    )
    # 120 of 70+60+45+60=235 would not match T2-01's 200 example; assert ratio math.
    fake = _normalise_risk_pillar(
        [
            ("a", {"value": 120}, True),
            ("b", {"value": 0}, False),
        ],
        {"a": 200, "b": 40},
    )
    assert fake["value"] == 60.0
    assert result["not_implemented"] is False


def test_doc2_absent_coverage_scores_full_risk_t2_02():
    from services.sales_risk_formula import calc_control_coverage_gap

    gap = calc_control_coverage_gap({"customerSpecificRiskCount": 3})
    assert gap["value"] == 40
    assert gap["has_input"] is True


def test_doc2_trust_gap_t2_03_t2_04():
    from services.sales_risk_formula import calc_trust_gap_friction

    included = calc_trust_gap_friction(
        {
            "vendorTrustScore": 74,
            "sector": "Healthcare",
            "customerRiskTolerance": "Conservative",
        }
    )
    assert included["value"] == 11
    missing = calc_trust_gap_friction({})
    assert missing["has_input"] is False


def test_doc2_five_integration_systems_t2_05():
    from services.sales_risk_formula import calc_integration_complexity

    systems = [
        "Identity / SSO",
        "Code hosting",
        "CI/CD",
        "Ticketing (Jira, ServiceNow)",
        "Data warehouse",
    ]
    result = calc_integration_complexity({"likelyIntegrationSystems": systems})
    assert result["system_count_penalty"] == 10
    expected_avg = (5 + 6 + 8 + 12 + 18) / 5
    assert abs(result["average_complexity"] - expected_avg) < 0.01
    assert abs(result["value"] - (expected_avg + 10)) < 0.01


def test_doc2_opportunity_renewal_t2_06():
    from services.sales_risk_formula import calc_opportunity_type, calculate_competitive_risk

    opp = calc_opportunity_type({"opportunityType": "Renewal"})
    assert opp["value"] == -12
    cr = calculate_competitive_risk(
        {
            "budgetMidpoint": "Not known",
            "opportunityType": "Renewal",
        }
    )
    assert cr["raw_total"] == 3  # 15 not-known budget + (-12) renewal


def test_doc2_competitive_clamp_t2_07():
    from services.sales_risk_formula import calculate_competitive_risk

    cr = calculate_competitive_risk(
        {
            "uniqueDifferentiators": [
                {"advantageType": "Compliance"},
                {"advantageType": "Security"},
                {"advantageType": "Price"},
                {"advantageType": "Product"},
                {"advantageType": "Support"},
                {"advantageType": "Ecosystem"},
            ]
        }
    )
    assert cr["value"] == 0


def test_doc2_blank_groups_do_not_deflate_scs():
    from services.sales_risk_formula import calculate_sales_risk_score

    public_only = calculate_sales_risk_score(
        {"customerDataSensitivity": "Public", "sector": "Technology"}
    )
    public_and_averse = calculate_sales_risk_score(
        {
            "customerDataSensitivity": "Public",
            "sector": "Technology",
            "customerRiskTolerance": "Very_Low",
        }
    )
    assert public_only["customer_friction_risk"] < public_and_averse["customer_friction_risk"]
    assert public_only["sales_confidence_score"] > public_and_averse["sales_confidence_score"]
    empty = calculate_sales_risk_score({})
    assert empty["detail"]["customer_friction_risk"]["not_implemented"] is True
    assert empty["sales_confidence_score"] == 100
    assert empty["detail"]["final_formula"]["pillar_weights"] == {
        "customer_friction": 0.35,
        "implementation": 0.35,
        "competitive": 0.30,
    }


def test_doc2_empty_payload_does_not_score_full_coverage_gap():
    from services.sales_risk_formula import (
        build_sales_risk_formula_input,
        calc_control_coverage_gap,
        calculate_sales_risk_score,
    )

    built = build_sales_risk_formula_input({})
    gap = calc_control_coverage_gap(built)
    assert built["proposedMitigationsCount"] is None
    assert gap["has_input"] is False
    scored = calculate_sales_risk_score(built)
    assert scored["detail"]["implementation_risk"]["control_coverage_gap"]["has_input"] is False
    assert scored["sales_confidence_score"] == 100


def test_doc2_key_advantages_map_to_registry_categories():
    from services.sales_risk_formula import build_sales_risk_formula_input

    built = build_sales_risk_formula_input(
        {"key_advantages": ["SOC 2 compliance", "Lower price", "24/7 support"]}
    )
    types = [row["advantageType"] for row in built["uniqueDifferentiators"]]
    assert types == ["Compliance", "Price", "Support"]
    assert "Domain_expertise" not in types

