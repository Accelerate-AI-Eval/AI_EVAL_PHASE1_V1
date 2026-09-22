"""Buyer industry segment → certification frameworks relevant for VTS scoring."""

from __future__ import annotations

CERT_FRAMEWORK_KEYS = {
    "SOC2_T2": "SOC 2 Type 2",
    "SOC2_T1": "SOC 2 Type 1",
    "HIPAA_HITRUST": "HIPAA BAA + HITRUST",
    "HIPAA_BAA": "HIPAA BAA only",
    "ISO27001": "ISO 27001:2022",
    "ISO42001": "ISO 42001",
    "NIST_AI_RMF": "NIST AI RMF",
    "NIST_CSF": "NIST CSF v2.0",
    "NIST_800_53": "NIST SP 800-53 Rev 5",
    "NIST_800_171": "NIST SP 800-171 Rev 3",
    "CMMC": "CMMC v2 Level 2+",
    "PCI": "PCI DSS 4.0",
    "DORA": "DORA",
    "GDPR": "GDPR",
}

_K = CERT_FRAMEWORK_KEYS

# Highest award each framework can earn. Used as the attainable denominator so a
# vendor is measured against the certifications that are relevant to the buyer,
# rather than against a flat cap that discards anything beyond it.
CERT_FRAMEWORK_MAX_POINTS: dict[str, float] = {
    _K["SOC2_T2"]: 15,
    _K["SOC2_T1"]: 8,
    _K["HIPAA_HITRUST"]: 15,
    _K["HIPAA_BAA"]: 10,
    _K["ISO27001"]: 10,
    _K["ISO42001"]: 8,
    _K["NIST_AI_RMF"]: 5,
    _K["NIST_CSF"]: 5,
    _K["NIST_800_53"]: 10,
    _K["NIST_800_171"]: 10,
    _K["CMMC"]: 12,
    _K["PCI"]: 10,
    _K["DORA"]: 8,
    _K["GDPR"]: 8,
}

# Tiers of the same certification. Only the highest tier is attainable, so the
# denominator does not double-count SOC 2 Type 1 alongside SOC 2 Type 2.
CERT_MUTUALLY_EXCLUSIVE_TIERS: list[tuple[str, ...]] = [
    (_K["SOC2_T2"], _K["SOC2_T1"]),
    (_K["HIPAA_HITRUST"], _K["HIPAA_BAA"]),
]

CERT_RELEVANCE_FRAMEWORKS_BY_SEGMENT: dict[str, set[str]] = {
    "federal government (us)": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["NIST_800_53"], _K["NIST_CSF"], _K["NIST_AI_RMF"], _K["CMMC"],
    },
    "state government (us)": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "local government (us)": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "education - k-12": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["NIST_CSF"], _K["GDPR"], _K["NIST_AI_RMF"],
    },
    "education - higher education": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["NIST_CSF"], _K["NIST_800_171"], _K["GDPR"], _K["NIST_AI_RMF"],
    },
    "energy & utilities": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["NIST_CSF"], _K["NIST_800_53"], _K["ISO27001"], _K["NIST_AI_RMF"],
    },
    "financial services - banking": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["PCI"], _K["ISO27001"], _K["DORA"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "financial services - investment mgmt": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["DORA"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "financial services - insurance": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["DORA"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "healthcare - hospitals & health systems": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["HIPAA_HITRUST"], _K["HIPAA_BAA"], _K["ISO27001"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "healthcare - payers (insurance)": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["HIPAA_HITRUST"], _K["HIPAA_BAA"], _K["ISO27001"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "healthcare - pharmaceuticals": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["GDPR"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "healthcare - medical devices": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["HIPAA_HITRUST"], _K["HIPAA_BAA"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "manufacturing - industrial": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "manufacturing - consumer goods": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["GDPR"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "professional services": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "retail & e-commerce": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["PCI"], _K["GDPR"], _K["ISO27001"], _K["NIST_AI_RMF"],
    },
    "technology & software": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["ISO42001"], _K["NIST_AI_RMF"], _K["NIST_CSF"], _K["CMMC"],
    },
    "transportation & logistics": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
    "other": {
        _K["SOC2_T2"], _K["SOC2_T1"], _K["ISO27001"], _K["NIST_CSF"], _K["NIST_AI_RMF"],
    },
}


def normalize_cert_industry_segment_input(raw: str) -> str:
    s = (
        str(raw or "")
        .strip()
        .lower()
        .replace("\t", " ")
    )
    while "  " in s:
        s = s.replace("  ", " ")
    s = s.replace(" & ", " & ").replace(" - ", " - ")
    import re
    s = re.sub(r"\s*&\s*", " & ", s)
    s = re.sub(r"\s*-\s*", " - ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s if s else "other"


def get_relevant_certification_framework_set(segment_normalized: str) -> set[str]:
    return CERT_RELEVANCE_FRAMEWORKS_BY_SEGMENT.get(
        segment_normalized,
        CERT_RELEVANCE_FRAMEWORKS_BY_SEGMENT["other"],
    )
