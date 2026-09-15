"""
Derive VTS Category_Coverage inputs from attestation answers + vector document evidence.

Replaces hardcoded MITIGATION_CATEGORIES[:6] / [:4] stubs.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any

from services.compliance_cert_blobs import (
    certification_form_text_from_getter,
    collect_compliance_upload_file_names,
)

logger = logging.getLogger(__name__)

# Document 1 §4.4 — no collectable input; drop from required and the denominator.
EXCLUDED_MITIGATION_CATEGORIES = {
    "Access Management & Authentication",
    "User Education & Awareness",
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

# Attestation field keys (and aliases) + lexical cues per mitigation category.
CATEGORY_SIGNALS: dict[str, dict[str, Any]] = {
    "Data Governance & Privacy Controls": {
        "fields": [
            "pii_handling",
            "pii_information",
            "data_retention_policy",
            "data_residency_options",
            "encryption_at_rest",
            "tls_in_transit",
            "data_subject_rights",
            "controller_or_processor",
            "privacy_programme_scope",
        ],
        "keywords": [
            "privacy",
            "gdpr",
            "ccpa",
            "pii",
            "phi",
            "data retention",
            "data residency",
            "data governance",
            "encryption",
            "tls",
            "data subject rights",
        ],
        "negative": [
            r"\bno\s+pii\b",
            r"\bnot\s+applicable\b",
            r"\bnot_disclosed\b",
            r"\bnot disclosed\b",
            r"\bn/?a\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": [],
        "upload_category_hints": ["privacy", "gdpr", "ccpa", "hipaa", "data"],
    },
    "Model Security & Integrity": {
        "fields": [
            "training_data_documentation",
            "training_data_document",
            "ai_model_types",
            "ai_models_usage",
            "adversarial_security_testing",
            "security_testing",
        ],
        "keywords": [
            "model security",
            "model integrity",
            "training data",
            "model card",
            "secure sdlc",
        ],
        "negative": [
            r"\bno\s+documentation\b",
            r"\bno\s+testing\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": ["evidenceTestingPolicy"],
        "upload_category_hints": ["security", "iso", "soc"],
    },
    "Access Management & Authentication": {
        "fields": ["audit_logs_available", "audit_logs"],
        "keywords": [
            "access control",
            "authentication",
            "authorization",
            "mfa",
            "rbac",
            "sso",
            "identity",
            "audit log",
        ],
        "negative": [r"^none$", r"^no$", r"\bnot\s+available\b"],
        "doc_keys": [],
        "upload_category_hints": ["soc", "iso", "access"],
    },
    "Testing & Auditing Procedures": {
        "fields": [
            "assessment_completion_level",
            "assessment_feedback",
            "audit_frequency",
            "testing_results_available",
            "test_results",
            "test_policy_document",
            "bias_testing_approach",
            "bias_ai",
            "independent_pen_test_frequency",
            "vulnerability_disclosure_policy",
            "bug_bounty",
        ],
        "keywords": [
            "audit",
            "testing",
            "assessment",
            "penetration",
            "independent review",
            "third-party",
        ],
        "negative": [
            r"\bno\s+formal\b",
            r"\bnot\s+independently\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": ["evidenceTestingPolicy"],
        "upload_category_hints": ["soc", "iso", "audit", "penetration"],
    },
    "Post-Deployment Monitoring": {
        "fields": [
            "bias_testing_approach",
            "bias_ai",
            "interaction_data_available",
            "available_usage_data",
            "change_management",
        ],
        "keywords": [
            "continuous monitoring",
            "post-deployment",
            "production monitoring",
            "observability",
            "usage analytics",
            "drift",
        ],
        "negative": [r"^none$", r"^no$", r"\bnot\s+available\b"],
        "doc_keys": [],
        "upload_category_hints": ["monitoring"],
    },
    "Incident Response & Recovery": {
        "fields": [
            "incident_response_plan",
            "rollback_capability",
            "rollback_deployment_issues",
        ],
        "keywords": [
            "incident response",
            "disaster recovery",
            "rollback",
            "business continuity",
            "ir plan",
        ],
        "negative": [
            r"\bin\s+development\b",
            r"\bno\s+plan\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": [],
        "upload_category_hints": ["incident"],
    },
    "Transparency & Documentation": {
        "fields": [
            "model_transparency",
            "ai_model_transparency",
            "training_data_documentation",
            "training_data_document",
            "documented_ai_governance_policy",
        ],
        "keywords": [
            "transparency",
            "documentation",
            "model card",
            "explainability",
            "governance policy",
        ],
        "negative": [
            r"\bproprietary\b",
            r"\blimited\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": ["aiGovernancePolicy"],
        "upload_category_hints": ["governance", "transparency"],
    },
    "Human Oversight Mechanisms": {
        "fields": ["human_oversight", "decision_autonomy", "ai_autonomy_level"],
        "keywords": [
            "human oversight",
            "human in the loop",
            "human-in-the-loop",
            "intervention",
            "override",
            "reviewer",
        ],
        "negative": [
            r"\bno\s+specific\b",
            r"\bno\s+oversight\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": ["aiGovernancePolicy"],
        "upload_category_hints": ["governance", "oversight"],
    },
    "Bias Detection & Mitigation": {
        "fields": ["bias_testing_approach", "bias_ai"],
        "keywords": [
            "bias",
            "fairness",
            "disparate impact",
            "non-discrimination",
            "equity testing",
        ],
        "negative": [
            r"\bno\s+formal\s+bias\b",
            r"\bno\s+bias\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": ["evidenceTestingPolicy"],
        "upload_category_hints": ["bias", "fairness"],
    },
    "Adversarial Robustness": {
        "fields": [
            "adversarial_security_testing",
            "security_testing",
            "bias_testing_approach",
            "bias_ai",
            "vulnerability_disclosure_policy",
            "bug_bounty",
            "independent_pen_test_frequency",
        ],
        "keywords": [
            "adversarial",
            "red team",
            "penetration test",
            "jailbreak",
            "prompt injection",
            "robustness",
        ],
        "negative": [
            r"\bno\s+testing\b",
            r"\bno\s+adversarial\b",
            r"^none$",
            r"^no$",
        ],
        "doc_keys": ["evidenceTestingPolicy"],
        "upload_category_hints": ["penetration", "security", "red team"],
    },
    "Supply Chain Security": {
        "fields": [
            "ai_model_types",
            "ai_models_usage",
            "sub_processors",
        ],
        "keywords": [
            "supply chain",
            "third-party model",
            "off-the-shelf",
            "vendor dependency",
            "sub-processor",
            "subprocessor",
            "sbom",
            "model provenance",
        ],
        "negative": [r"^none$", r"^no$"],
        "doc_keys": [],
        "upload_category_hints": ["soc", "iso", "supply"],
    },
    "Compliance & Regulatory Adherence": {
        "fields": [
            "security_certifications",
            "security_compliance_certificates",
            "regulatorycompliance_cert_material",
            "assessment_completion_level",
            "assessment_feedback",
            "hipaa_baa",
            "dpa_available",
            "fedramp_authorization",
        ],
        "keywords": [
            "compliance",
            "regulatory",
            "soc 2",
            "soc2",
            "iso 27001",
            "hipaa",
            "fedramp",
            "certification",
        ],
        "negative": [r"^none$", r"^no$", r"\bnot\s+certified\b"],
        "doc_keys": [],
        "upload_category_hints": [
            "soc",
            "iso",
            "hipaa",
            "fedramp",
            "compliance",
            "nist",
        ],
    },
    "User Education & Awareness": {
        "fields": ["support_slas", "change_management", "human_oversight"],
        "keywords": [
            "user education",
            "training",
            "awareness",
            "onboarding",
            "documentation for users",
            "feedback mechanism",
        ],
        "negative": [r"^none$", r"^no$"],
        "doc_keys": [],
        "upload_category_hints": ["training", "education"],
    },
}

# Cosine similarity between attestation embedding and category query
_ATTESTATION_VECTOR_THRESHOLD = 0.42
# pgvector chunk similarity that supports marking a category implemented
_PGVECTOR_EVIDENCE_THRESHOLD = 0.38


def _cp(payload: dict[str, Any]) -> dict[str, Any]:
    raw = payload.get("companyProfile")
    return raw if isinstance(raw, dict) else {}


def _get(payload: dict[str, Any], key: str) -> Any:
    if key in payload and payload[key] is not None:
        return payload[key]
    return _cp(payload).get(key)


def _flatten(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return " ".join(_flatten(v) for v in value if v is not None)
    if isinstance(value, dict):
        return " ".join(_flatten(v) for v in value.values())
    return str(value).strip()


def _is_emptyish(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return True
    return bool(
        re.fullmatch(
            r"(none|n/?a|na|null|undefined|not\s+specified|not\s+provided|not_disclosed|not disclosed|-|—)",
            t,
        )
    )


def _matches_any(text: str, patterns: list[str]) -> bool:
    if not text:
        return False
    return any(re.search(p, text, re.I) for p in patterns)


def _doc_uploads(payload: dict[str, Any]) -> dict[str, Any]:
    for key in ("document_uploads", "documentUpload"):
        raw = payload.get(key)
        if isinstance(raw, dict):
            return raw
        nested = _cp(payload).get(key)
        if isinstance(nested, dict):
            return nested
    return {}


def _upload_names_for_keys(uploads: dict[str, Any], keys: list[str]) -> list[str]:
    names: list[str] = []
    for key in keys:
        arr = uploads.get(key)
        if isinstance(arr, list):
            for item in arr:
                if isinstance(item, str) and item.strip():
                    names.append(item.strip())
    return names


def _slot2_category_blob(uploads: dict[str, Any]) -> str:
    slot2 = uploads.get("2")
    if not isinstance(slot2, dict):
        return ""
    parts: list[str] = []
    cats = slot2.get("categories")
    if isinstance(cats, list):
        parts.extend(str(c) for c in cats if c)
    by_cat = slot2.get("byCategory")
    if isinstance(by_cat, dict):
        for cat, files in by_cat.items():
            parts.append(str(cat))
            if isinstance(files, list):
                parts.extend(str(f) for f in files if f)
    return " ".join(parts).lower()


def _framework_mapping_blob(payload: dict[str, Any]) -> str:
    rows = payload.get("framework_mapping_rows")
    if not isinstance(rows, list):
        rows = _cp(payload).get("framework_mapping_rows")
    if not isinstance(rows, list):
        return ""
    parts: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in (
            "framework",
            "control_id",
            "control_title",
            "coverage",
            "category",
            "mitigation_category",
        ):
            val = row.get(key)
            if val:
                parts.append(str(val))
    return " ".join(parts).lower()


def build_attestation_evidence_blob(payload: dict[str, Any]) -> str:
    """Flatten attestation answers + upload names into searchable evidence text."""

    def getter(k: str) -> Any:
        return _get(payload, k)

    field_keys: list[str] = []
    for signals in CATEGORY_SIGNALS.values():
        field_keys.extend(list(signals.get("fields") or []))
    # De-dupe while preserving order
    seen: set[str] = set()
    ordered_keys: list[str] = []
    for k in field_keys:
        if k not in seen:
            seen.add(k)
            ordered_keys.append(k)

    parts = [_flatten(getter(k)) for k in ordered_keys]
    parts.append(certification_form_text_from_getter(getter))
    parts.extend(collect_compliance_upload_file_names(payload))

    uploads = _doc_uploads(payload)
    parts.extend(_upload_names_for_keys(uploads, ["aiGovernancePolicy", "evidenceTestingPolicy", "0", "1"]))
    parts.append(_slot2_category_blob(uploads))
    parts.append(_framework_mapping_blob(payload))

    # Product / company context helps vector matching
    for k in (
        "company_description",
        "tech_product_specifications",
        "regulatorycompliance_cert_material",
        "product_capabilities",
        "change_management",
        "support_slas",
    ):
        parts.append(_flatten(getter(k)))

    return re.sub(r"\s+", " ", " ".join(p for p in parts if p)).strip().lower()


def _field_evidence_for_category(
    payload: dict[str, Any],
    category: str,
    *,
    evidence_blob: str | None = None,
) -> bool:
    signals = CATEGORY_SIGNALS.get(category) or {}
    negatives = list(signals.get("negative") or [])
    fields = list(signals.get("fields") or [])
    keywords = [str(k).lower() for k in (signals.get("keywords") or [])]

    field_texts: list[str] = []
    for key in fields:
        text = _flatten(_get(payload, key))
        if _is_emptyish(text):
            continue
        if _matches_any(text, negatives):
            continue
        field_texts.append(text.lower())

    if field_texts:
        return True

    uploads = _doc_uploads(payload)
    doc_keys = list(signals.get("doc_keys") or [])
    if _upload_names_for_keys(uploads, doc_keys):
        return True

    slot2 = _slot2_category_blob(uploads)
    hints = [h.lower() for h in (signals.get("upload_category_hints") or [])]
    if slot2 and any(h in slot2 for h in hints):
        return True

    blob = evidence_blob if evidence_blob is not None else build_attestation_evidence_blob(payload)
    fw = _framework_mapping_blob(payload)
    if keywords and any(kw in fw for kw in keywords):
        return True
    if (
        keywords
        and collect_compliance_upload_file_names(payload)
        and any(h in slot2 for h in hints)
        and any(kw in blob for kw in keywords)
    ):
        return True

    return False


def derive_required_categories(payload: dict[str, Any]) -> list[str]:
    """
    Categories in scope for this attestation (denominator for coverage).

    Always includes a core AI-vendor set; adds conditional categories from answers.
    """
    required: list[str] = [
        "Data Governance & Privacy Controls",
        "Testing & Auditing Procedures",
        "Incident Response & Recovery",
        "Transparency & Documentation",
        "Human Oversight Mechanisms",
        "Compliance & Regulatory Adherence",
        "Model Security & Integrity",
        "Post-Deployment Monitoring",
    ]

    blob = build_attestation_evidence_blob(payload)
    stage = _flatten(_get(payload, "product_stage") or _get(payload, "stage_product")).lower()
    autonomy = _flatten(
        _get(payload, "decision_autonomy") or _get(payload, "ai_autonomy_level")
    ).lower()
    pii = _flatten(_get(payload, "pii_handling") or _get(payload, "pii_information")).lower()
    models = _flatten(_get(payload, "ai_model_types") or _get(payload, "ai_models_usage")).lower()

    if "bias" in blob or not _is_emptyish(_flatten(_get(payload, "bias_testing_approach") or _get(payload, "bias_ai"))):
        required.append("Bias Detection & Mitigation")
    if (
        "adversarial" in blob
        or "red team" in blob
        or not _is_emptyish(
            _flatten(_get(payload, "adversarial_security_testing") or _get(payload, "security_testing"))
        )
    ):
        required.append("Adversarial Robustness")
    if any(tok in models for tok in ("third", "off-the-shelf", "open source", "openai", "anthropic", "vendor")):
        required.append("Supply Chain Security")
    if "audit log" in blob or not _is_emptyish(_flatten(_get(payload, "audit_logs_available") or _get(payload, "audit_logs"))):
        required.append("Access Management & Authentication")
    if any(tok in blob for tok in ("training", "education", "awareness", "onboarding")) or not _is_emptyish(
        _flatten(_get(payload, "support_slas"))
    ):
        required.append("User Education & Awareness")
    if "critical" in pii or "extensive" in pii or "phi" in pii:
        if "Data Governance & Privacy Controls" not in required:
            required.append("Data Governance & Privacy Controls")
    if "production" in stage or "autonom" in autonomy:
        if "Post-Deployment Monitoring" not in required:
            required.append("Post-Deployment Monitoring")
        if "Human Oversight Mechanisms" not in required:
            required.append("Human Oversight Mechanisms")

    ordered = [
        c for c in MITIGATION_CATEGORIES
        if c in set(required) and c not in EXCLUDED_MITIGATION_CATEGORIES
    ]
    return ordered or [
        c for c in MITIGATION_CATEGORIES
        if c not in EXCLUDED_MITIGATION_CATEGORIES
    ][:8]


def derive_implemented_from_attestation(
    payload: dict[str, Any],
    *,
    evidence_blob: str | None = None,
) -> list[str]:
    blob = evidence_blob if evidence_blob is not None else build_attestation_evidence_blob(payload)
    implemented: list[str] = []
    for category in MITIGATION_CATEGORIES:
        if _field_evidence_for_category(payload, category, evidence_blob=blob):
            implemented.append(category)
    return implemented

def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return float(dot / (math.sqrt(na) * math.sqrt(nb)))


def derive_implemented_from_vectors(
    categories: list[str],
    attestation_blob: str,
) -> tuple[list[str], dict[str, Any]]:
    """
    Use embeddings of attestation evidence + pgvector document chunks to detect
    implemented mitigation categories.
    """
    meta: dict[str, Any] = {
        "used": False,
        "attestation_similarities": {},
        "pgvector_hits": {},
        "error": None,
    }
    if not attestation_blob.strip() or not categories:
        return [], meta

    try:
        from services.embedding_service import EmbeddingService
        from services.pgvector_store import PgVectorStore

        embedder = EmbeddingService()
        store = PgVectorStore()
        store.ensure_schema()

        # Truncate blob for embedding cost/limits
        blob_for_embed = attestation_blob[:6000]
        att_emb = embedder.embed_query(
            f"Vendor attestation mitigation and control evidence: {blob_for_embed}"
        )

        implemented: list[str] = []
        for category in categories:
            signals = CATEGORY_SIGNALS.get(category) or {}
            keywords = ", ".join(signals.get("keywords") or [])
            query = (
                f"Mitigation category evidence for {category}. "
                f"Related controls and documentation: {keywords}"
            )
            cat_emb = embedder.embed_query(query)
            sim = _cosine(att_emb, cat_emb)
            meta["attestation_similarities"][category] = round(sim, 4)

            hits = store.similarity_search(cat_emb, k=3)
            best = max((float(h.get("score") or 0) for h in hits), default=0.0)
            meta["pgvector_hits"][category] = {
                "best_score": round(best, 4),
                "files": [str(h.get("file_name") or "") for h in hits[:2]],
            }

            keyword_hit = any(
                kw in attestation_blob for kw in (signals.get("keywords") or []) if isinstance(kw, str)
            )
            if sim >= _ATTESTATION_VECTOR_THRESHOLD:
                implemented.append(category)
            elif best >= _PGVECTOR_EVIDENCE_THRESHOLD and keyword_hit:
                # Formula/rubric docs confirm the category and attestation mentions it
                implemented.append(category)

        meta["used"] = True
        return implemented, meta
    except Exception as exc:
        logger.warning("Vector category coverage failed: %s", exc)
        meta["error"] = str(exc)
        return [], meta


def _relevance_for_category(
    category: str,
    attestation_sims: dict[str, float],
    pg_hits: dict[str, Any],
    from_attestation: bool,
    from_vector: bool,
) -> float:
    sim = float(attestation_sims.get(category) or 0)
    pg = float((pg_hits.get(category) or {}).get("best_score") or 0)
    base = 0.55
    if from_attestation:
        base = 0.7
    if from_vector:
        base = max(base, 0.65 + 0.25 * max(sim, pg))
    return round(min(0.95, max(0.25, base)), 4)


def resolve_category_coverage_inputs(
    payload: dict[str, Any],
    *,
    use_vector: bool = True,
) -> dict[str, Any]:
    """
    Build requiredCategories, implementedCategories, and mitigations for the VTS formula.
    """
    required = derive_required_categories(payload)
    blob = build_attestation_evidence_blob(payload)
    from_form = derive_implemented_from_attestation(payload, evidence_blob=blob)

    vector_implemented: list[str] = []
    vector_meta: dict[str, Any] = {"used": False}
    if use_vector:
        vector_implemented, vector_meta = derive_implemented_from_vectors(required, blob)

    implemented_set = set(from_form) | set(vector_implemented)
    # Only count categories that are required
    implemented = [c for c in required if c in implemented_set]

    att_sims = dict(vector_meta.get("attestation_similarities") or {})
    pg_hits = dict(vector_meta.get("pgvector_hits") or {})
    form_set = set(from_form)
    vec_set = set(vector_implemented)

    mitigations: list[dict[str, Any]] = []
    for cat in implemented:
        mitigations.append(
            {
                "mitigationId": cat,
                "riskCount": 1,
                "avgRelevance": _relevance_for_category(
                    cat,
                    att_sims,
                    pg_hits,
                    from_attestation=cat in form_set,
                    from_vector=cat in vec_set,
                ),
            }
        )
    if not mitigations:
        # calc_evidence_quality requires a non-empty list
        mitigations = [{"mitigationId": "none", "riskCount": 1, "avgRelevance": 0.2}]

    return {
        "requiredCategories": required,
        "implementedCategories": implemented,
        "mitigations": mitigations,
        "meta": {
            "required_count": len(required),
            "implemented_count": len(implemented),
            "from_attestation": from_form,
            "from_vector": vector_implemented,
            "coverage_ratio": round(len(implemented) / len(required), 4) if required else 0.0,
            "vector": vector_meta,
            "evidence_blob_chars": len(blob),
        },
    }
