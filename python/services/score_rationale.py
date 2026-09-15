"""
Console rationales for assessment scores (Type 1 / 2 / 3).

Keeps the classic VTS RATIONALE layout, with clear plain-language explanations.
"""

from __future__ import annotations

from typing import Any


def _bar(char: str = "=", width: int = 72) -> str:
    return char * width


def _emit(lines: list[str]) -> str:
    """Print rationale lines (flushed) and return the same text for Node/API."""
    text = "\n".join(lines)
    print(text, flush=True)
    return text


def _safe(text: Any, limit: int = 400) -> str:
    s = str(text if text is not None else "").strip()
    s = (
        s.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u00d7", "x")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )
    if len(s) > limit:
        return s[: limit - 3] + "..."
    return s


def _is_empty(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str) and not val.strip():
        return True
    if isinstance(val, (list, dict)) and len(val) == 0:
        return True
    s = str(val).strip().lower()
    return s in {"", "not specified", "n/a", "na", "none", "null", "undefined"}


def _payload_get(payload: dict[str, Any] | None, keys: tuple[str, ...]) -> Any:
    if not payload:
        return None
    cp = payload.get("companyProfile") if isinstance(payload.get("companyProfile"), dict) else {}
    for k in keys:
        if k in payload and not _is_empty(payload.get(k)):
            return payload.get(k)
        if isinstance(cp, dict) and k in cp and not _is_empty(cp.get(k)):
            return cp.get(k)
    return None


def _bool_yes_local(v: Any) -> bool:
    """True for bare yes/true and Buyer COTS options like 'Yes - Active board…'."""
    if isinstance(v, bool):
        return v
    s = str(v if v is not None else "").strip().lower()
    return s.startswith("yes") or s in ("true", "available", "exists", "defined")


# ---------------------------------------------------------------------------
# Type 1 - Vendor Trust Score (VTS)
# ---------------------------------------------------------------------------

_VTS_KEY_FIELDS: list[tuple[str, tuple[str, ...]]] = [
    ("Security certifications", ("security_certifications", "security_compliance_certificates")),
    ("HIPAA BAA", ("hipaa_baa",)),
    ("Incident response plan", ("incident_response_plan",)),
    ("Uptime / SLA", ("uptime_sla", "sla_guarantee")),
    ("PII handling", ("pii_handling", "pii_information")),
    ("Data retention policy", ("data_retention_policy",)),
    ("Data residency", ("data_residency_options",)),
    ("Human oversight", ("human_oversight",)),
    ("AI governance policy", ("documented_ai_governance_policy",)),
    ("Bias testing", ("bias_testing_approach", "bias_ai")),
    ("Security / adversarial testing", ("adversarial_security_testing", "security_testing")),
    ("Training data documentation", ("training_data_documentation", "training_data_document")),
    ("Audit logs", ("audit_logs_available", "audit_logs")),
    ("Audit frequency", ("audit_frequency",)),
    ("Encryption at rest", ("encryption_at_rest",)),
    ("TLS in transit", ("tls_in_transit",)),
    ("Data subject rights", ("data_subject_rights",)),
    ("Sub-processors", ("sub_processors",)),
    ("Vulnerability disclosure policy", ("vulnerability_disclosure_policy",)),
    ("Bug bounty", ("bug_bounty",)),
    ("Independent pen-test frequency", ("independent_pen_test_frequency",)),
    ("DPA available", ("dpa_available",)),
    ("Rollback capability", ("rollback_capability", "rollback_deployment_issues")),
    ("Support SLAs", ("support_slas",)),
    ("Decision autonomy", ("decision_autonomy", "ai_autonomy_level")),
    ("Product stage", ("product_stage", "stage_product")),
    ("Assessment completion level", ("assessment_completion_level", "assessment_feedback")),
]


def _num(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _dict(val: Any) -> dict[str, Any]:
    return val if isinstance(val, dict) else {}


def _vts_formula_console_lines(formula: dict[str, Any]) -> list[str]:
    """Step-by-step VTS arithmetic plus every hardcoded constant used by the formula."""
    detail = _dict(formula.get("detail"))
    pr_block = _dict(detail.get("product_risk"))
    gr_block = _dict(detail.get("governance_risk"))
    or_block = _dict(detail.get("operational_risk"))
    final = _dict(detail.get("final_formula"))

    L = _dict(pr_block.get("likelihood"))
    I = _dict(pr_block.get("impact"))
    S = _dict(pr_block.get("severity"))
    CM = _dict(pr_block.get("combined_contextual_multiplier"))
    ET = _dict(CM.get("entity_type_multiplier"))
    TM = _dict(CM.get("timing_multiplier"))
    AM = _dict(CM.get("architecture_multiplier"))
    SMUL = _dict(CM.get("scale_multiplier"))
    IM = _dict(CM.get("intent_multiplier"))
    DW = _dict(pr_block.get("domain_weight"))
    SM = _dict(pr_block.get("sector_modifier"))
    IR = _dict(pr_block.get("inherent_risk"))
    ME = _dict(pr_block.get("mitigation_effectiveness"))
    COV = _dict(ME.get("category_coverage"))
    EQ = _dict(ME.get("evidence_quality"))
    CF = _dict(pr_block.get("confidence_factor"))
    PRD = _dict(pr_block.get("product_risk"))

    pr = _num(formula.get("product_risk"))
    gr = _num(formula.get("governance_risk"))
    opr = _num(formula.get("operational_risk"))
    weighted = _num(formula.get("weighted_risk"))
    vts = _num(formula.get("vendor_trust_score"))
    pr_w, gr_w, or_w = 0.40, 0.30, 0.30
    pr_c = _num(final.get("product_risk_contribution"), pr * pr_w)
    gr_c = _num(final.get("governance_risk_contribution"), gr * gr_w)
    or_c = _num(final.get("operational_risk_contribution"), opr * or_w)

    l_val = _num(L.get("value"))
    i_val = _num(I.get("value"))
    cm_val = _num(CM.get("value"))
    dw_val = _num(DW.get("value"))
    sm_val = _num(SM.get("value"))
    ir_val = _num(IR.get("value"))
    me_val = _num(ME.get("value"))
    cf_val = _num(CF.get("value"))
    residual = _num(PRD.get("residual_pre_confidence"), ir_val * (1 - me_val))

    lines: list[str] = [
        "VTS FORMULA CALCULATION (console)",
        _bar(),
        "",
        "HARDCODED CONSTANTS",
        "  Top-level:           VTS = 100 - [(PR x 0.40) + (GR x 0.30) + (OR x 0.30)]",
        "  PR_WEIGHT            = 0.40",
        "  GR_WEIGHT            = 0.30",
        "  OR_WEIGHT            = 0.30",
        "  BASE_SCORE           = 100",
        "  L/I clamp            = 1.0 .. 5.0",
        "  L/I default stub     = [3, 3, 3]   (used when Risk Intellect scores are missing)",
        "  S default stub       = [9, 9, 9]   (or LxI per risk when lengths match)",
        "  Intent defaults      = intentional=1, unintentional=2",
        "  assessmentPhase      = vendor_evaluation",
        "  applicableDomains    = derived from product exposure (Document 1 §4.3)",
        "  aiCapabilityType     = administrative      (hardcoded; Healthcare SM lookup)",
        "  patientDemographic   = general             (hardcoded)",
        "  Inherent risk:       IR = min(100, (((L x I) x CM x DW) + SM) x 4)",
        "  IR_NORMALIZE         = 4",
        "  IR_CAP               = 100",
        "  Mitigation:          ME = (Category_Coverage x 0.60) + (Evidence_Quality x 0.40)",
        "  ME_COVERAGE_WEIGHT   = 0.60",
        "  ME_QUALITY_WEIGHT    = 0.40",
        "  Product risk:        PR = clamp(IR x (1 - ME) x CF, 0, 100)",
        "  Governance risk:     GR = 100 x (1 - gov_earned / gov_attainable)",
        "  Operational risk:    OR = 100 x (1 - ops_earned / ops_attainable)",
        "  Certifications cap   = 25 (attainable 23)",
        "  CM clamp             = 0.143 .. 3.1  (no risk-tolerance multiplier on VTS)",
        "  CF                   = 1.0 x 0.95 cert-in-date x 0.97 pen-test x 0.98 testing x 0.98 trust-centre",
        "                       clamped to [0.80, 1.20]; assessment method is Governance-only",
        "  Grade bands          = A>=90, B>=80, C>=70, D>=60, else F",
        "",
        "HARDCODED LOOKUP TABLES (formula maps)",
        "  Entity type base:    advisory=0.8, assisted=0.9, supervised=1.0,",
        "                       autonomous=1.2, fully_autonomous=1.3",
        "  Stake adjustment:    Low=-0.1, Moderate=0.0, High=0.1, Critical=0.15,",
        "                       Life-Critical=0.2",
        "  Timing base:         design=0.75, development=0.80, testing=0.85,",
        "                       staging=0.95, production/new/mature=1.30",
        "  Assessment phase:    pre_procurement=-0.05, vendor_evaluation=-0.03,",
        "                       pilot=0.0, scaling=0.05, mature_deployment=0.10",
        "  Customization:       off_the_shelf=0.70 .. fully_custom=1.40",
        "  Integration:         standalone=0.00 .. legacy_systems=0.20",
        "  Hosting:             cloud_hosted=0.00, on_premise=0.05, hybrid=0.08,",
        "                       edge_devices=0.10",
        "  Employee scale:      1-10=0.70 .. 10000+=1.20",
        "  Geography:           single_location=1.00 .. global=1.20",
        "  Data volume adj:     minimal=0.00 .. petabyte_scale=0.12",
        "  Risk appetite:       aggressive=0.85, moderate=1.00, conservative=1.15,",
        "                       risk_averse=1.25",
        "  Intent:              intentional_pct>0.6 -> 1.2; unintentional_pct>0.6 -> 0.7;",
        "                       else Mixed=1.0",
        "  Domain weights:      Privacy & Security=1.20, AI System Safety=1.20,",
        "                       Fairness=1.15, Transparency=1.10, Human Oversight=1.10,",
        "                       Accountability=1.00, Socioeconomic=0.90",
        "  Sector SM base:      Healthcare=cap-map (default 5), Financial=5, AV=6,",
        "                       Government=5, E-Commerce=3, Technology=1, else=1",
        "  Confidence method:   third_party_audit=0.90 .. no_formal_assessment=1.15",
        "  CF extras:           docs_complete=0.98, pen-test cadence map, pen-test",
        "                       report=0.97, SOC2 Type2=0.95",
        "",
        "TOP-LEVEL ARITHMETIC",
        f"  PR (product risk)      = {pr:.4f}",
        f"  GR (governance risk)   = {gr:.4f}",
        f"  OR (operational risk)  = {opr:.4f}",
        f"  PR x 0.40              = {pr:.4f} x 0.40 = {pr_c:.4f}",
        f"  GR x 0.30              = {gr:.4f} x 0.30 = {gr_c:.4f}",
        f"  OR x 0.30              = {opr:.4f} x 0.30 = {or_c:.4f}",
        f"  weighted_risk          = {pr_c:.4f} + {gr_c:.4f} + {or_c:.4f} = {weighted:.4f}",
        f"  VTS                    = max(0, 100 - {weighted:.4f}) = {vts:.2f}",
        "",
        "PRODUCT RISK",
        f"  Likelihood L           = {_safe(L.get('value'))}   "
        f"(n={L.get('riskCount')}, source={_safe(L.get('source') or 'payload', 80)})",
        f"  Impact I               = {_safe(I.get('value'))}   "
        f"(n={I.get('riskCount')}, source={_safe(I.get('source') or 'payload', 80)})",
        f"  Severity S             = {_safe(S.get('value'))}   "
        f"(source={_safe(S.get('source') or '-', 80)}, derived={S.get('derived')})",
        f"  base_risk              = L x I = {l_val:.4f} x {i_val:.4f} = {_num(IR.get('base_risk'), l_val * i_val):.4f}",
        f"  Entity type ET         = base {ET.get('et_base')} + stake {ET.get('stake_adjustment')} "
        f"= {ET.get('value')}",
        f"  Timing TM              = base {TM.get('tm_base')} + phase {TM.get('phase_adjustment')} "
        f"= {TM.get('value')}",
        f"  Architecture AM        = base {AM.get('am_base')} + integ {AM.get('integration_adj')} "
        f"+ host {AM.get('hosting_adj')} = {AM.get('value')}",
        f"  Scale SMUL             = (emp {SMUL.get('employee_base')} x geo {SMUL.get('geographic_factor')}) "
        f"+ data {SMUL.get('data_volume_adj')} = {SMUL.get('value')}",
        f"  Intent IM              = {IM.get('value')}   profile={IM.get('profile')} "
        f"(intentional={IM.get('intentional_count')}/{IM.get('intentional_pct')}%, "
        f"unintentional={IM.get('unintentional_count')}/{IM.get('unintentional_pct')}%)",
        f"  CM                     = clamp(ET x TM x AM x SMUL x IM, 0.143, 3.1) = {cm_val}",
        f"  Domain weight DW       = weighted_sum {DW.get('weighted_sum')} / total_risks "
        f"{DW.get('total_risks')} = {dw_val}",
    ]

    for row in DW.get("breakdown") or []:
        if isinstance(row, dict):
            lines.append(
                f"    domain {row.get('domain')}: weight={row.get('weight')} "
                f"x riskCount={row.get('risk_count')} -> {row.get('contribution')}"
            )

    lines.extend(
        [
            f"  Sector modifier SM     = base {SM.get('sm_base')} + adj {SM.get('use_case_adjustment')} "
            f"= {sm_val}   (sector={_safe(SM.get('sector'), 40)})",
            f"  contextual_risk        = base_risk x CM = {IR.get('contextual_risk')}",
            f"  domain_weighted_risk   = contextual_risk x DW = {IR.get('domain_weighted_risk')}",
            f"  sector_adjusted_risk   = domain_weighted + SM = {IR.get('sector_adjusted_risk')}",
            f"  normalized_risk        = sector_adjusted x 4 = {IR.get('normalized_risk')}",
            f"  IR (capped)            = min(100, normalized) = {ir_val}",
            f"  Category coverage      = implemented {COV.get('implemented_count')} / "
            f"required {COV.get('required_count')} = {COV.get('value')}",
            f"  Evidence quality       = total_weighted {EQ.get('total_weighted')} / "
            f"instances {EQ.get('total_risk_instances')} = {EQ.get('value')}",
            f"  ME                     = ({COV.get('value')} x 0.60) + ({EQ.get('value')} x 0.40) = {me_val}",
            f"  CF                     = method_base {CF.get('method_base')} "
            f"x adjustments {CF.get('evidence_adjustments')} = {cf_val}",
            f"  residual               = IR x (1 - ME) = {ir_val:.4f} x (1 - {me_val:.4f}) = {residual:.4f}",
            f"  PR                     = residual x CF = {residual:.4f} x {cf_val:.4f} = {pr:.4f}",
            "",
            "GOVERNANCE RISK  (score parts are hardcoded point maps; risk = 100 - score)",
            f"  certifications         = {gr_block.get('certifications_score')}",
            f"  assessment_quality     = {gr_block.get('assessment_quality_score')}",
            f"  policy                 = {gr_block.get('policy_score')}",
            f"  operational_controls   = {gr_block.get('operational_controls_score')}",
            f"  vendor_maturity        = {gr_block.get('vendor_maturity_adjustment')}",
            f"  data_protection        = {gr_block.get('data_protection_score')}",
            f"  supply_chain           = {gr_block.get('supply_chain_score')}",
            f"  adversarial_disclosure = {gr_block.get('adversarial_disclosure_score')}",
            f"  dpa                    = {gr_block.get('dpa_score')}",
            f"  raw_governance_score   = {gr_block.get('raw_governance_score')}",
            f"  governance_score       = {gr_block.get('governance_score')}   (clamped 0..100)",
            f"  GR                     = 100 - {gr_block.get('governance_score')} = {gr:.4f}",
            "",
            "OPERATIONAL RISK  (score parts are hardcoded point maps; risk = 100 - score)",
            f"  sla                    = {or_block.get('sla_score')}",
            f"  incident_management    = {or_block.get('incident_management_score')}",
            f"  deployment_maturity    = {or_block.get('deployment_maturity_score')}",
            f"  stability              = {or_block.get('stability_score')}",
            f"  support                = {or_block.get('support_score')}",
            f"  raw_operational_score  = {or_block.get('raw_operational_score')}",
            f"  operational_score      = {or_block.get('operational_score')}   (capped at 100)",
            f"  OR                     = 100 - {or_block.get('operational_score')} = {opr:.4f}",
            "",
        ]
    )
    return lines


def print_vts_rationale(
    *,
    final_score: float,
    scoring_source: str,
    interpretation: dict[str, str],
    trust_block: dict[str, Any],
    formula: dict[str, Any],
    formula_vts: float,
    llm_score: float | None,
    payload: dict[str, Any] | None,
    llm_error: str | None = None,
    vector_meta: dict[str, Any] | None = None,
) -> str:
    """VENDOR TRUST SCORE (Type 1) - EXPLAINED layout (matches Type 2/3 rationales)."""
    grade = interpretation.get("grade") or "?"
    classification = interpretation.get("classification") or "-"
    action = interpretation.get("recommended_action") or "-"
    categories = trust_block.get("scoreByCategory")
    vector_meta = vector_meta or {}

    pr = float(formula.get("product_risk") or 0)
    gr = float(formula.get("governance_risk") or 0)
    opr = float(formula.get("operational_risk") or 0)
    ranked = sorted(
        [
            ("Product risk", pr, 0.40, "mitigations, domain coverage, evidence quality"),
            ("Governance risk", gr, 0.30, "certs, policies, assessment quality, maturity"),
            ("Operational risk", opr, 0.30, "SLA, incident management, deployment maturity, support"),
        ],
        key=lambda x: x[1] * x[2],
        reverse=True,
    )

    missing = [
        label
        for label, keys in _VTS_KEY_FIELDS
        if _is_empty(_payload_get(payload, keys))
    ]

    weak_cats: list[tuple[str, Any]] = []
    if isinstance(categories, dict):
        for name, raw in categories.items():
            if isinstance(raw, str) and "not enough" in raw.lower():
                weak_cats.append((str(name), raw))
                continue
            try:
                n = float(raw)
            except (TypeError, ValueError):
                continue
            if n < 80:
                weak_cats.append((str(name), n))
        weak_cats.sort(key=lambda x: (999 if isinstance(x[1], str) else float(x[1])))

    trust_rounded = round(final_score)
    lines: list[str] = [
        "VENDOR TRUST SCORE (Type 1) - EXPLAINED",
        _bar(),
        "",
        "RESULT",
        f"  Trust score:   {trust_rounded} / 100   (higher = more trustworthy)",
        f"  Grade:         {grade} - {_safe(classification, 80)}",
        f"  Next step:     {_safe(action, 160)}",
        f"  Source:        {scoring_source}",
    ]

    lines.extend(
        [
            "",
            "KEY DRIVERS (higher risk lowers trust):",
        ]
    )
    for idx, (name, risk, _weight, _tip) in enumerate(ranked, start=1):
        biggest = "  << biggest drag" if idx == 1 else ""
        lines.append(
            f"    {idx}. {name:<22} {risk:5.2f}{biggest}"
        )

    lines.extend(["", "WHAT TO IMPROVE (to raise trust score)"])
    if ranked:
        top_name, top_risk, _w, top_tip = ranked[0]
        lines.append(f"  1. Biggest drag: {top_name} ({top_risk:.1f}) - {top_tip}")
        if len(ranked) > 1:
            name2, risk2, _w2, tip2 = ranked[1]
            lines.append(f"  2. {name2} ({risk2:.1f}) - {tip2}")

    concrete: list[str] = []
    if weak_cats:
        for name, val in weak_cats[:4]:
            if isinstance(val, str):
                concrete.append(f"Strengthen {name}: add concrete evidence in attestation")
            else:
                tip = (
                    "strengthen controls & proof"
                    if float(val) >= 70
                    else "document policies, certs, testing, or SLAs"
                )
                concrete.append(f"Raise {name} ({val}/100) - {tip}")
    if missing:
        for label in missing[:6]:
            concrete.append(f"Complete {label} in the attestation")

    if concrete:
        lines.append("  3. From attestation evidence, prioritize:")
        for item in concrete[:8]:
            lines.append(f"       - {item}")
    elif len(ranked) > 2:
        name3, risk3, _w3, tip3 = ranked[2]
        lines.append(f"  3. {name3} ({risk3:.1f}) - {tip3}")
    else:
        lines.append("  Trust signals look solid - keep evidence current and renew certifications on schedule.")

    lines.append("")
    text = _emit(lines)
    print("\n".join(_vts_formula_console_lines(formula)), flush=True)
    return text


# ---------------------------------------------------------------------------
# Type 2 - Sales Risk Score (SRS)
# ---------------------------------------------------------------------------

def _subdriver_tips(detail_block: Any) -> list[str]:
    if not isinstance(detail_block, dict):
        return []
    tips: list[tuple[float, str]] = []
    label_map = {
        "regulatory_complexity": "Reduce regulatory friction / clarify compliance path",
        "data_sensitivity_friction": "Address data sensitivity / compliance documentation",
        "risk_tolerance_friction": "Align to customer risk tolerance with clear controls",
        "customer_specific_risk_friction": "Cover customer-specific risks with mitigations",
        "integration_complexity": "Simplify integrations or provide connectors / playbooks",
        "customization_required": "Reduce customization; offer config-first options",
        "timeline_pressure": "Propose a realistic timeline or phased rollout",
        "feature_gap": "Close critical feature gaps or roadmap commitments",
        "mitigation_gap": "Add concrete risk mitigations per customer concern",
        "control_coverage_gap": "Close control coverage gaps with named mitigations",
        "trust_gap_friction": "Close the vendor trust gap before security review",
        "sector_risk_climate": "Address sector incident climate in the narrative",
        "opportunity_type": "Account for opportunity type (renewal vs new logo)",
        "competitive_alternatives": "Differentiate vs alternatives / build-vs-buy",
        "budget_constraint": "Right-size packaging / ROI story for the budget",
        "competitive_advantage": "Strengthen unique differentiators",
        "vendor_buyer_maturity_gap": "Close maturity / expectation mismatch with buyer",
    }
    for key, tip in label_map.items():
        block = detail_block.get(key)
        if isinstance(block, dict) and block.get("value") is not None:
            try:
                tips.append((float(block["value"]), tip))
            except (TypeError, ValueError):
                continue
    tips.sort(key=lambda x: x[0], reverse=True)
    return [tip for value, tip in tips if value > 0][:3]


def _srs_formula_console_lines(
    result: dict[str, Any],
    formula_input: dict[str, Any] | None = None,
) -> list[str]:
    """Step-by-step SRS arithmetic plus every hardcoded constant used by Type 2."""
    detail = _dict(result.get("detail"))
    cfr = _dict(detail.get("customer_friction_risk"))
    ir = _dict(detail.get("implementation_risk"))
    cr = _dict(detail.get("competitive_risk"))
    intent = _dict(detail.get("intent_multiplier"))
    final = _dict(detail.get("final_formula"))
    src = formula_input if isinstance(formula_input, dict) else {}

    reg = _dict(cfr.get("regulatory_complexity"))
    dsf = _dict(cfr.get("data_sensitivity_friction"))
    rtf = _dict(cfr.get("risk_tolerance_friction"))
    csrf = _dict(cfr.get("customer_specific_risk_friction"))

    integ = _dict(ir.get("integration_complexity"))
    cust = _dict(ir.get("customization_required"))
    timep = _dict(ir.get("timeline_pressure"))
    feat = _dict(ir.get("feature_gap"))
    mit = _dict(ir.get("mitigation_gap"))

    alts = _dict(cr.get("competitive_alternatives"))
    budg = _dict(cr.get("budget_constraint"))
    adv = _dict(cr.get("competitive_advantage"))
    mat = _dict(cr.get("vendor_buyer_maturity_gap"))

    srs = _num(result.get("sales_risk_score"))
    deal = _num(result.get("deal_probability_pct"), max(0.0, 100.0 - srs))
    cfr_v = _num(result.get("customer_friction_risk"), _num(cfr.get("value")))
    ir_v = _num(result.get("implementation_risk"), _num(ir.get("value")))
    cr_v = _num(result.get("competitive_risk"), _num(cr.get("value")))
    cfr_c = _num(final.get("customer_friction_contribution"), cfr_v * 0.35)
    ir_c = _num(final.get("implementation_risk_contribution"), ir_v * 0.35)
    cr_c = _num(final.get("competitive_risk_contribution"), cr_v * 0.30)
    base_w = _num(final.get("base_weighted_sum"), cfr_c + ir_c + cr_c)
    intent_v = _num(final.get("intent_multiplier"), _num(intent.get("value"), 1.0))
    weighted = _num(final.get("weighted_sum"), base_w * intent_v)

    lines: list[str] = [
        "SRS FORMULA CALCULATION (console)  [Vendor COTS / Type 2]",
        _bar(),
        "",
        "HARDCODED CONSTANTS",
        "  Top-level:           SCS = 100 - [CFR x 0.35 + IR x 0.35 + CR x 0.30]",
        "  CFR_WEIGHT           = 0.35",
        "  IR_WEIGHT            = 0.35",
        "  CR_WEIGHT            = 0.30",
        "  SCORE_CAP            = 100",
        "  SCORE_FLOOR          = 0",
        "  Deal probability     = max(0, 100 - SRS)",
        "  Grade bands (deal%): A>=90, B>=80, C>=70, D>=60, else F",
        "  Intent:              intentional_pct>0.6 -> 1.2; unintentional_pct>0.6 -> 0.7; else Mixed=1.0",
        "  Intent clamp         = 0.5 .. 1.5  (invalid precomputed value falls back to 1.0)",
        "  CFR:                 value = min(100, RC + DSF + RTF + CSRF)",
        "  IR:                  value = min(100, Integ + Cust + Timeline + FeatureGap + MitGap)",
        "  CR:                  value = max(0, Alts + Budget + Advantage + MaturityGap)",
        "  Integration default  = unknown systemType -> 8",
        "  Integration penalty  = max(0, point_count - 3) x 5",
        "  Feature gap:         (100 - productFeatureMatchPct) / 2 + missingCriticalCount x 8",
        "  Mitigation gap:      gap_ratio x max_penalty(40); if no mitigations but risks exist, cap 20",
        "  Deadline bonus:      min(15, max(0, monthsUntilDeadline x -3 + 20))",
        "  Unique req penalty   = customerSpecificRiskCount x 5  (when unique requirements flag is true)",
        "  Conservative proof   = customerSpecificRiskCount x 2 + regulatory_count",
        "  Workflow penalty     = businessProcessChangesRequired x 3",
        "  Industry expertise   = -10 if yearsInCustomerSector >= 5 else 0",
        "  Size mismatch:       min(15, (customerEmployeeCount / vendorEmployeeCount) x 3)",
        "  Feature match fallback = 50 if no features; else min(100, 40 + 8 x min(feature_count, 7))",
        "  Vendor emp band mids = 1-10=5, 11-50=30, 51-200=125, 201-1000=500,",
        "                         1001-5000=3000, 5001-10000=7500, 10000+=15000, else=50",
        "",
        "HARDCODED LOOKUP TABLES (formula maps)",
        "  Sector RC multiplier: Healthcare=6, Financial_Services=5, Government=5,",
        "                        Autonomous_Systems=7, E_Commerce=3, Technology=2, Other=3,",
        "                        missing sector -> 2",
        "  Data sensitivity:     Critical=30, High=20, Medium=10, Low=5  (default Low=5)",
        "  Compliance burden:    Healthcare/Financial_Services=3 else 2  (x regulatory_count)",
        "  Risk tolerance:       Aggressive=3, Moderate=8, Conservative=15, Risk_averse=20",
        "                        (default Moderate=8)",
        "  Customer type weight: Enterprise=12, Mid_market=10, SMB=7  (default 7)",
        "  Integration types:    Legacy_mainframe=35, Legacy_client_server=28,",
        "                        Modern_monolith=20, Microservices=15, Cloud_native_API=10,",
        "                        SaaS_standard_connector=5",
        "  Customization:        None=0, Minimal=5, Moderate=15, Significant=20,",
        "                        Extensive=25, Custom_build=40  (default 12)",
        "  Industry workflow:    Healthcare=12, Financial_Services=10, Government=8,",
        "                        Autonomous_Systems=10, Other=5",
        "  Timeline months:      <2=30, <3=20, <6=10, <12=5, else=2",
        "  Timeline band map:    exploratory=30, immediate=1, 1-3=2, 3-6=5, 6-12=9,",
        "                        12-18=15, 18+=20, unmatched=8",
        "  Competitors:          0 sole=0, 1=10, 2-3=20, 4+=25  (default 10)",
        "  Build capability:     Strong=20, Moderate=10, Weak=5  (default 10)",
        "  Budget:               <$100K=35, $100-250K=25, $250-500K=15, $500K-1M=10,",
        "                        $1-5M=5, >$5M=0  (default $100K-$250K=25)",
        "  Approval:             VP_and_below=0, C_suite_single=3, C_suite_multiple=8,",
        "                        Board_approval=15  (default C_suite_single=3)",
        "  Differentiator:       Regulatory_certification=10, Proven_customer_in_sector=8,",
        "                        Faster_deployment=5, Lower_TCO=7, Superior_feature_set=6,",
        "                        Domain_expertise=8, Technology_leadership=5",
        "  Maturity gap table:   startup: Ent=25/Mid=15/SMB=5;",
        "                        growth: Ent=15/Mid=5/SMB=0;",
        "                        established: Ent=5/Mid=0/SMB=0;",
        "                        mature: all 0; unknown vendorStage -> established",
        "  Advantage category:   product=Superior_feature_set, security=Technology_leadership,",
        "                        compliance=Regulatory_certification, price=Lower_TCO,",
        "                        support=Faster_deployment, ecosystem=Proven_customer_in_sector,",
        "                        else Domain_expertise",
        "",
        "HARDCODED FORMULA-INPUT DEFAULTS (payload builder)",
        "  customerHasUniqueRequirements = False",
        "  regulatoryDeadlineExists      = False",
        "  monthsUntilDeadline           = None",
        "  missingCriticalFeatures       = []",
        "  avgMitigationsPerRisk         = 4 if any mitigations else 0; calc fallback 4",
        "  approvalLevels fallback       = C_suite_single",
        "  customerTechnicalCapability   = Moderate (difficult build) when unknown",
        "  customerRequiresIndustryWorkflows = True unless customerType is SMB",
        "  businessProcessChangesRequired  = min(4, customerSpecificRiskCount)",
        "  employee fallbacks (no headcount): Enterprise=2000, Mid_market=500, SMB=100",
        "  expects_larger                = customerEmployeeCount > vendorEmployeeCount x 2",
        "  vendor_stage bump             = mature if AI-maturity evidence_count >= 3",
        "  budget unknown                = < $100K",
        "  data sensitivity default      = Low (Public or anonymized)",
        "  risk tolerance default        = Moderate",
        "  customization default         = Moderate (config + light dev)",
        "  sector default                = Other",
        "  vendor stage default          = established",
        "",
        "FORMULA INPUT VALUES (normalized, used in math)",
        f"  sector                        = {_safe(src.get('sector'), 60)}",
        f"  customerType                  = {_safe(src.get('customerType'), 40)}",
        f"  customerDataSensitivity       = {_safe(src.get('customerDataSensitivity'), 80)}",
        f"  customerRiskTolerance         = {_safe(src.get('customerRiskTolerance'), 40)}",
        f"  customerRegulatoryRequirements= {_safe(src.get('customerRegulatoryRequirements'), 200)}",
        f"  customerSpecificRiskCount     = {src.get('customerSpecificRiskCount')}",
        f"  customerHasUniqueRequirements = {src.get('customerHasUniqueRequirements')}  (hardcoded False)",
        f"  uniqueRequirementsList        = {_safe(src.get('uniqueRequirementsList'), 200)}",
        f"  integrationPoints             = {_safe(src.get('integrationPoints'), 240)}",
        f"  customizationLevel            = {_safe(src.get('customizationLevel'), 80)}",
        f"  customerRequiresIndustryWorkflows = {src.get('customerRequiresIndustryWorkflows')}",
        f"  businessProcessChangesRequired= {src.get('businessProcessChangesRequired')}",
        f"  implementationTimelineMonths  = {src.get('implementationTimelineMonths')}",
        f"  regulatoryDeadlineExists      = {src.get('regulatoryDeadlineExists')}  (hardcoded False)",
        f"  monthsUntilDeadline           = {src.get('monthsUntilDeadline')}  (hardcoded None)",
        f"  productFeatureMatchPct        = {src.get('productFeatureMatchPct')}",
        f"  missingCriticalFeatures       = {_safe(src.get('missingCriticalFeatures'), 120)}  (hardcoded [])",
        f"  proposedMitigationsCount      = {src.get('proposedMitigationsCount')}",
        f"  avgMitigationsPerRisk         = {src.get('avgMitigationsPerRisk')}",
        f"  competitorCount               = {_safe(src.get('competitorCount'), 40)}",
        f"  customerConsideringBuildVsBuy = {src.get('customerConsideringBuildVsBuy')}",
        f"  customerTechnicalCapability   = {_safe(src.get('customerTechnicalCapability'), 60)}",
        f"  budgetMidpoint                = {_safe(src.get('budgetMidpoint'), 40)}",
        f"  approvalLevels                = {_safe(src.get('approvalLevels'), 40)}",
        f"  uniqueDifferentiators         = {_safe(src.get('uniqueDifferentiators'), 200)}",
        f"  yearsInCustomerSector         = {src.get('yearsInCustomerSector')}",
        f"  vendorStage                   = {_safe(src.get('vendorStage'), 40)}",
        f"  customerExpectsLargerVendorFeatures = {src.get('customerExpectsLargerVendorFeatures')}",
        f"  customerEmployeeCount         = {src.get('customerEmployeeCount')}",
        f"  vendorEmployeeCount           = {src.get('vendorEmployeeCount')}",
        f"  intentionalRiskCount          = {src.get('intentionalRiskCount')}",
        f"  unintentionalRiskCount        = {src.get('unintentionalRiskCount')}",
        f"  intent_multiplier_value       = {src.get('intent_multiplier_value')}",
        f"  intent_profile                = {_safe(src.get('intent_profile'), 40)}",
        f"  _degraded_fields              = {_safe(src.get('_degraded_fields'), 200)}",
        "",
        "CUSTOMER FRICTION RISK (CFR)",
        f"  RC  = count {reg.get('regulatory_requirement_count')} x sector_mult "
        f"{reg.get('sector_complexity_multiplier')} = {reg.get('value')}",
        f"  DSF = sensitivity {dsf.get('data_sensitivity_base_points')} + "
        f"(reg_count {dsf.get('regulatory_count')} x burden_rate {dsf.get('compliance_burden_rate')}"
        f" = {dsf.get('compliance_documentation_burden')}) = {dsf.get('value')}",
        f"  RTF = tolerance {rtf.get('tolerance_base_points')} + proof "
        f"{rtf.get('proof_requirement_burden')} "
        f"(conservative={rtf.get('is_conservative_or_averse')}, "
        f"risks={rtf.get('customer_specific_risk_count')}, regs={rtf.get('regulatory_count')}) "
        f"= {rtf.get('value')}",
        f"  CSRF= risks {csrf.get('customer_specific_risk_count')} x weight "
        f"{csrf.get('risk_weight')} = {csrf.get('base_contribution')} + unique_penalty "
        f"{csrf.get('unique_requirement_penalty')} = {csrf.get('value')}",
        f"  raw CFR = {reg.get('value')} + {dsf.get('value')} + {rtf.get('value')} + "
        f"{csrf.get('value')} = {cfr.get('raw_total')}",
        f"  CFR     = min(100, raw) = {cfr_v}   capped={cfr.get('is_capped')}",
        "",
        "IMPLEMENTATION RISK (IR)",
        f"  Integ   avg={integ.get('average_complexity')} + count_penalty "
        f"{integ.get('system_count_penalty')} (n={integ.get('integration_point_count')}) "
        f"= {integ.get('value')}",
        f"  points  = {_safe(integ.get('integration_points'), 240)}",
        f"  Cust    base={cust.get('base_customization_effort')} + industry "
        f"{cust.get('industry_specific_penalty')} + workflow "
        f"{cust.get('workflow_modification_penalty')} "
        f"(process_changes={cust.get('business_process_changes')}) = {cust.get('value')}",
        f"  Time    base={timep.get('base_timeline_risk')} + deadline "
        f"{timep.get('deadline_criticality_bonus')} "
        f"(months={timep.get('implementation_timeline_months')}, "
        f"deadline={timep.get('regulatory_deadline_exists')}) = {timep.get('value')}",
        f"  Feat    (100 - match {feat.get('product_feature_match_pct')}) / 2 = "
        f"{feat.get('feature_gap_base')} + critical x8 "
        f"{feat.get('critical_feature_penalty')} (n={feat.get('missing_critical_count')}) "
        f"= {feat.get('value')}",
        f"  Mit     required={mit.get('required_mitigations')} "
        f"(risks={mit.get('customer_specific_risk_count')} x avg={mit.get('avg_mitigations_per_risk')}) "
        f"- proposed={mit.get('proposed_mitigations')} -> gap={mit.get('mitigation_gap_count')} "
        f"ratio={mit.get('gap_ratio')} x max_penalty {mit.get('max_penalty')} = {mit.get('value')}"
        f"{'  [no-mitigation cap 20]' if mit.get('default_no_mitigation_data') else ''}",
        f"  raw IR  = {integ.get('value')} + {cust.get('value')} + {timep.get('value')} + "
        f"{feat.get('value')} + {mit.get('value')} = {ir.get('raw_total')}",
        f"  IR      = min(100, raw) = {ir_v}   capped={ir.get('is_capped')}",
        "",
        "COMPETITIVE RISK (CR)",
        f"  Alts    competition={alts.get('base_competition_points')} + build_penalty "
        f"{alts.get('build_option_penalty')} (considering_build="
        f"{alts.get('customer_considering_build_vs_buy')}, cap="
        f"{_safe(alts.get('customer_technical_capability'), 40)}) = {alts.get('value')}",
        f"  Budget  budget_pts={budg.get('budget_base_points')} "
        f"({_safe(budg.get('budget_midpoint'), 30)}) + approval "
        f"{budg.get('budget_approval_complexity')} ({_safe(budg.get('approval_levels'), 30)}) "
        f"= {budg.get('value')}",
        f"  Adv     -differentiator_total {adv.get('differentiator_total')} + "
        f"industry_bonus {adv.get('industry_expertise_bonus')} "
        f"(years={adv.get('years_in_customer_sector')}) = {adv.get('value')}  "
        f"(negative lowers risk)",
        f"  diffs   = {_safe(adv.get('unique_differentiators'), 200)}",
        f"  Mat     base_gap={mat.get('base_maturity_gap')} "
        f"(stage={_safe(mat.get('vendor_stage'), 20)} / type={_safe(mat.get('customer_type'), 20)}) "
        f"+ mismatch {mat.get('expectation_mismatch_penalty')} "
        f"(cust_emp={mat.get('customer_employee_count')} / vend_emp="
        f"{mat.get('vendor_employee_count')}) = {mat.get('value')}",
        f"  raw CR  = {alts.get('value')} + {budg.get('value')} + {adv.get('value')} + "
        f"{mat.get('value')} = {cr.get('raw_total')}",
        f"  CR      = max(0, raw) = {cr_v}   floored={cr.get('is_floored')}",
        "",
        "INTENT MULTIPLIER",
        f"  intentional={intent.get('intentional_count')}  "
        f"unintentional={intent.get('unintentional_count')}  "
        f"profile={_safe(intent.get('profile'), 30)}  value={intent_v}",
        "",
        "TOP-LEVEL ARITHMETIC",
        f"  CFR x 0.35             = {cfr_v:.4f} x 0.35 = {cfr_c:.4f}",
        f"  IR  x 0.35             = {ir_v:.4f} x 0.35 = {ir_c:.4f}",
        f"  CR  x 0.30             = {cr_v:.4f} x 0.30 = {cr_c:.4f}",
        f"  base_weighted_sum      = {cfr_c:.4f} + {ir_c:.4f} + {cr_c:.4f} = {base_w:.4f}",
        f"  x Intent {intent_v}    = {base_w:.4f} x {intent_v} = {weighted:.4f}",
        f"  SRS                    = min(100, max(0, {weighted:.4f})) = {srs:.2f}",
        f"  Deal probability       = max(0, 100 - {srs:.2f}) = {deal:.2f}",
        f"  Grade                  = {_safe(result.get('grade'), 8)} - "
        f"{_safe(result.get('classification'), 80)}",
        "",
    ]
    return lines


def print_srs_rationale(
    *,
    result: dict[str, Any],
    formula_input: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> str:
    """SALES RISK SCORE (Type 2) - EXPLAINED layout (no executive summary)."""
    srs = float(result.get("sales_risk_score") or 0)
    deal = float(result.get("deal_probability_pct") or max(0, 100 - srs))
    grade = str(result.get("grade") or "?")
    classification = str(result.get("classification") or "-")
    deal_chars = _safe(result.get("deal_characteristics") or "", 200)
    actions = _safe(result.get("recommended_actions") or "", 200)

    cfr = float(result.get("customer_friction_risk") or 0)
    ir = float(result.get("implementation_risk") or 0)
    cr = float(result.get("competitive_risk") or 0)
    ranked = sorted(
        [
            ("Customer friction", cfr, 0.35, "Address data sensitivity / compliance documentation"),
            ("Implementation", ir, 0.35, "Add concrete risk mitigations per customer concern"),
            ("Competitive", cr, 0.30, "Differentiate vs alternatives / build-vs-buy"),
        ],
        key=lambda x: x[1] * x[2],
        reverse=True,
    )

    detail = result.get("detail") if isinstance(result.get("detail"), dict) else {}
    improve: list[str] = []
    for idx, (name, risk, _w, focus) in enumerate(ranked, start=1):
        if risk <= 0:
            continue
        block_key = {
            "Customer friction": "customer_friction_risk",
            "Implementation": "implementation_risk",
            "Competitive": "competitive_risk",
        }[name]
        subs = _subdriver_tips(detail.get(block_key))
        tip = subs[0] if subs else focus
        improve.append(f"{idx}. {name} ({risk:.1f}) - {tip}")

    src = formula_input if isinstance(formula_input, dict) else {}
    if not src and isinstance(payload, dict):
        src = payload
    sector = src.get("sector")
    cust = src.get("customerType") or src.get("customer_type")

    lines: list[str] = [
        "SALES CONFIDENCE SCORE (Type 2) - EXPLAINED",
        _bar(),
        "",
        "RESULT",
        f"  Sales confidence:   {deal:.2f} / 100   (higher = stronger deal)",
        f"  Internal risk:      {srs:.2f} / 100   (not displayed)",
        f"  Grade:              {grade} - {_safe(classification, 80)}",
    ]
    if deal_chars:
        lines.append(f"  Deal picture:       {deal_chars}")
    if actions:
        lines.append(f"  Recommended move:   {actions}")

    lines.extend(
        [
            "",
            "KEY DRIVERS (higher = more sales risk):",
        ]
    )
    for idx, (name, risk, _weight, _tip) in enumerate(ranked, start=1):
        biggest = "  << biggest drag" if idx == 1 else ""
        lines.append(
            f"    {idx}. {name:<22} {risk:5.2f}{biggest}"
        )
    if sector:
        lines.append(f"  Sector context: {_safe(sector, 40)}")
    if cust:
        lines.append(f"  Customer type: {_safe(cust, 40)}")

    lines.extend(["", "WHAT TO IMPROVE (to lower sales risk / raise deal odds)"])
    if improve:
        for item in improve[:3]:
            lines.append(f"  {item}")
    else:
        lines.append("  Risks look low - keep the standard sales path and reinforce value proof.")
    lines.append("")
    text = _emit(lines)
    formula_text = "\n".join(_srs_formula_console_lines(result, formula_input))
    print(formula_text, flush=True)
    result["formula_console"] = formula_text
    return text


# ---------------------------------------------------------------------------
# Type 3 - Buyer Implementation Readiness Score (IRS)
# ---------------------------------------------------------------------------

def _irs_component_lines(title: str, pillar: dict[str, Any]) -> list[str]:
    lines = [title, f"  value={pillar.get('value')}  excluded={pillar.get('excluded')}"]
    for row in pillar.get("components") or []:
        flag = "in" if row.get("included") else "out"
        lines.append(
            f"    [{flag}] {row.get('name'):<16} w={row.get('weight')}  "
            f"v={row.get('value')}  {row.get('reason') or ''}"
        )
    return lines


def _irs_formula_console_lines(
    result: dict[str, Any],
    buyer_payload: dict[str, Any] | None = None,
) -> list[str]:
    """Step-by-step IRS arithmetic (Documents 0 and 3)."""
    breakdown = _dict(result.get("breakdown"))
    detail = _dict(result.get("detail"))
    org = _dict(detail.get("organizational_readiness_gap"))
    integ = _dict(detail.get("integration_risk"))
    vr_p = _dict(detail.get("vendor_risk"))
    final = _dict(detail.get("final_formula"))
    resolved = _dict(detail.get("resolved_inputs"))
    if not resolved and isinstance(buyer_payload, dict):
        resolved = buyer_payload
    weights = _dict(final.get("weights") or breakdown.get("pillarWeightsUsed"))
    vr = _num(breakdown.get("vendorRisk"), _num(final.get("vendor_risk")))
    org_v = _num(
        breakdown.get("organizationalReadinessGap"),
        _num(final.get("organizational_readiness_gap"), _num(org.get("value"))),
    )
    integ_v = _num(
        breakdown.get("integrationRisk"),
        _num(final.get("integration_risk"), _num(integ.get("value"))),
    )
    vts = _num(breakdown.get("vendorTrustScore"))
    w_vr = _num(weights.get("vendor_risk"), 0.35)
    w_org = _num(weights.get("organizational_readiness"), 0.35)
    w_int = _num(weights.get("integration_risk"), 0.30)
    risk_term = _num(final.get("risk_term"), vr * w_vr + org_v * w_org + integ_v * w_int)
    weighted = _num(final.get("weighted"), 100.0 - risk_term)
    irs = _num(result.get("implementationRiskScore"), _num(final.get("score")))
    blockers = detail.get("blockers") if isinstance(detail.get("blockers"), list) else []

    lines: list[str] = [
        "IRS FORMULA CALCULATION (console)  [Buyer COTS / Type 3 / Docs 0+3]",
        _bar(),
        "",
        "HARDCODED CONSTANTS",
        "  Top-level:           IRS = 100 - (VR x 0.35 + ORG x 0.35 + IntR x 0.30)",
        "  Missing pillars:     excluded; weights redistributed (Doc 0 §6)",
        "  VR leaves:           Base 0.35, Maturity_Gap 0.25, Cert_Gap 0.20, Track 0.10, Financial 0.10",
        "  ORG leaves:          AI_Gov 0.25, Data_Gov 0.20, Skills 0.25, Change 0.15, Budget 0.15",
        "  IntR leaves:         Technical 0.20, Use-case 0.20, Fit 0.15, Lock-in 0.15, Rollback 0.10, Scaling 0.20",
        "  Base Vendor Risk:    clamp((100 - VTS) x RTM, 0, 100)",
        "  RTM:                 Very Low 1.25, Low 1.15, Moderate 1.00, High 0.90, Very High 0.85",
        "  No attestation:      Base = 50 x RTM (disclosed)",
        "  RTM applied:         here only, not on VTS",
        "  Dispute:             +5 per disputed prefill, cap +20, added to VR",
        "  Track record:        0 and 'no public record found' when AIRI has no match",
        "  Grade bands (IRS):   A>=76, B>=51, C>=26, else D",
        "  Blockers:            override recommendation; score unchanged",
        "",
        "FORMULA INPUT VALUES (resolved)",
        f"  aiGovernanceMaturity          = {_safe(resolved.get('aiGovernanceMaturity'), 80)}",
        f"  dataGovernanceMaturity        = {_safe(resolved.get('dataGovernanceMaturity'), 80)}",
        f"  aiSkillsAvailability          = {_safe(resolved.get('aiSkillsAvailability'), 80)}",
        f"  changeManagementCapability    = {_safe(resolved.get('changeManagementCapability'), 80)}",
        f"  implementationCapacity        = {_safe(resolved.get('implementationCapacity'), 80)}",
        f"  riskAppetite                  = {_safe(resolved.get('riskAppetite'), 80)}",
        f"  decisionStakes                = {_safe(resolved.get('decisionStakes'), 80)}",
        f"  unavailabilityImpact          = {_safe(resolved.get('unavailabilityImpact'), 80)}",
        f"  dataSensitivity               = {_safe(resolved.get('dataSensitivity'), 80)}",
        f"  humanReviewLevel              = {_safe(resolved.get('humanReviewLevel'), 80)}",
        f"  integrationSystems            = {_safe(resolved.get('integrationSystems'), 200)}",
        f"  rollbackCapability            = {_safe(resolved.get('rollbackCapability'), 80)}",
        f"  deploymentModel               = {_safe(resolved.get('deploymentModel'), 80)}",
        f"  pilotStatus                   = {_safe(resolved.get('pilotStatus'), 80)}",
        f"  usersInScope                  = {_safe(resolved.get('usersInScope'), 40)}",
        f"  useCaseTypes                  = {_safe(resolved.get('useCaseTypes'), 160)}",
        f"  budgetRange                   = {_safe(resolved.get('budgetRange'), 80)}",
        f"  vendorEvidenceReceived        = {_safe(resolved.get('vendorEvidenceReceived'), 160)}",
        "",
        *_irs_component_lines("VENDOR RISK", vr_p),
        f"  Vendor_Trust_Score   = {vts:.2f}  source={_safe(detail.get('vts_source'), 40)}",
        f"  disputeAdjustment    = {breakdown.get('disputeAdjustment')}",
        f"  VR                   = {vr:.2f}",
        "",
        *_irs_component_lines("ORGANIZATIONAL READINESS GAP", org),
        f"  ORG                  = {org_v:.2f}",
        "",
        *_irs_component_lines("INTEGRATION RISK", integ),
        f"  IntR                 = {integ_v:.2f}",
        "",
        "BLOCKERS",
        f"  {blockers or 'none'}",
        "",
        "TOP-LEVEL ARITHMETIC",
        f"  weights used                       = {weights}",
        f"  VR x {w_vr:.4f}                    = {vr:.4f} x {w_vr:.4f} = {vr * w_vr:.4f}",
        f"  ORG x {w_org:.4f}                  = {org_v:.4f} x {w_org:.4f} = {org_v * w_org:.4f}",
        f"  IntR x {w_int:.4f}                 = {integ_v:.4f} x {w_int:.4f} = {integ_v * w_int:.4f}",
        f"  risk_term                          = {risk_term:.4f}",
        f"  IRS                                = 100 - {risk_term:.4f} = {weighted:.4f}",
        f"  IRS (clamped, half-up)             = {irs:.0f}",
        f"  Grade                              = {_safe(result.get('grade'), 8)} - "
        f"{_safe(result.get('classification'), 80)}",
        f"  Decision                           = {_safe(result.get('decision'), 80)}",
        "",
    ]
    return lines


def print_irs_rationale(
    *,
    result: dict[str, Any],
    buyer_payload: dict[str, Any] | None = None,
) -> str:
    """IMPLEMENTATION READINESS SCORE (Type 3) - EXPLAINED layout."""
    readiness = float(result.get("implementationRiskScore") or 0)
    grade = str(result.get("grade") or "?")
    classification = str(result.get("classification") or "-")
    decision = str(result.get("decision") or "-")
    profile = _safe(result.get("readiness_profile") or "", 200)
    action = _safe(result.get("recommendedAction") or "", 200)
    breakdown = result.get("breakdown") if isinstance(result.get("breakdown"), dict) else {}
    source = result.get("source") if isinstance(result.get("source"), dict) else {}

    vendor_risk = float(breakdown.get("vendorRisk") or 0)
    org_gap = float(breakdown.get("organizationalReadinessGap") or 0)
    integ = float(breakdown.get("integrationRisk") or 0)
    vts = float(breakdown.get("vendorTrustScore") or 0)

    ranked = sorted(
        [
            (
                "Integration risk",
                integ,
                0.30,
                "Reduce write/admin integrations, complete a pilot, add monitoring/audit/export/testing",
            ),
            (
                "Org readiness gap",
                org_gap,
                0.35,
                "Raise implementation capacity, human review, and governance maturity from onboarding",
            ),
            (
                "Vendor risk",
                vendor_risk,
                0.35,
                "Choose a higher-trust vendor product, or improve vendor attestation evidence",
            ),
        ],
        key=lambda x: x[1] * x[2],
        reverse=True,
    )

    concrete: list[str] = []
    bp = buyer_payload if isinstance(buyer_payload, dict) else {}
    if bp:
        capacity = str(bp.get("implementationCapacity") or bp.get("implementationTeamComposition") or "").lower()
        if "no one assigned" in capacity or "shared" in capacity or "no team" in capacity:
            concrete.append("Assign a dedicated implementation owner or team")
        review = str(bp.get("humanReviewLevel") or "").lower()
        if "no review" in review or "exception" in review:
            concrete.append("Increase human review before AI output is used")
        systems = bp.get("integrationSystems")
        sys_n = len(systems) if isinstance(systems, list) else 0
        if sys_n >= 3:
            concrete.append(f"Simplify or phase integrations ({sys_n} systems listed)")
        usage = str(bp.get("currentUsageState") or bp.get("requirementGaps") or "").lower()
        if "not in use" in usage or usage.startswith("no"):
            concrete.append("Run a controlled pilot before full rollout")
        if str(bp.get("monitoringDataStance") or "").lower() == "dispute" or not _bool_yes_local(
            bp.get("monitoringDataAvailable")
        ):
            concrete.append("Confirm monitoring data will be available")
        if not _bool_yes_local(bp.get("testingResultsAvailable")):
            evidence = bp.get("vendorEvidenceReceived")
            has_test = isinstance(evidence, list) and any(
                "test" in str(x).lower() or "pen-test" in str(x).lower() for x in evidence
            )
            if not has_test:
                concrete.append("Collect model/safety testing or pen-test evidence")
        export = str(bp.get("dataExportCapability") or "").lower()
        if export.startswith("no"):
            concrete.append("Negotiate a data-export / exit path")

    vendor_name = _safe(source.get("vendorName") or "Vendor", 40)
    product_name = _safe(source.get("productName") or "Product", 40)
    used_att = bool(source.get("usedAttestation"))

    lines: list[str] = [
        "IMPLEMENTATION READINESS SCORE (Type 3) - EXPLAINED",
        _bar(),
        "",
        "RESULT",
        f"  Readiness:   {round(readiness)} / 100   (higher = more ready to implement)",
        f"  Grade:       {grade} - {_safe(classification, 80)}",
        f"  Decision:    {_safe(decision, 80)}",
    ]
    if profile:
        lines.append(f"  Profile:     {profile}")
    if action:
        lines.append(f"  Next step:   {action}")
    lines.append(f"  Vendor:      {vendor_name} / {product_name}")

    lines.extend(
        [
            "",
            "KEY DRIVERS (higher risk lowers readiness):",
        ]
    )
    for idx, (name, risk, _weight, _tip) in enumerate(ranked, start=1):
        biggest = "  << biggest drag" if idx == 1 else ""
        lines.append(
            f"    {idx}. {name:<22} {risk:5.2f}{biggest}"
        )
    lines.append(
        f"  Vendor trust used: {vts:.0f}/100  "
        f"({'from selected product attestation' if used_att else 'default / limited attestation'})"
    )

    lines.extend(["", "WHAT TO IMPROVE (to raise readiness)"])
    if ranked:
        top_name, top_risk, _w, top_tip = ranked[0]
        lines.append(
            f"  1. Biggest drag: {top_name} ({top_risk:.1f}) - {top_tip}"
        )
        if len(ranked) > 1:
            name2, risk2, _w2, tip2 = ranked[1]
            lines.append(f"  2. {name2} ({risk2:.1f}) - {tip2}")
    if concrete:
        lines.append("  3. From your answers, prioritize:")
        for item in concrete[:8]:
            lines.append(f"       - {item}")
    elif len(ranked) > 2:
        name3, risk3, _w3, tip3 = ranked[2]
        lines.append(f"  3. {name3} ({risk3:.1f}) - {tip3}")
    lines.append("")
    text = _emit(lines)
    formula_text = "\n".join(_irs_formula_console_lines(result, buyer_payload))
    print(formula_text, flush=True)
    result["formula_console"] = formula_text
    return text
