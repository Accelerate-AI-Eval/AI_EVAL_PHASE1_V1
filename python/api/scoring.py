"""VTS scoring endpoint — Python owns LLM trust score + formula; Node persists results."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import traceback
from functools import partial

from fastapi import APIRouter

from exceptions.custom_exceptions import (
    RiskCalculationException,
    TokenQuotaExceededError,
    raise_http_exception,
    raise_token_quota_http,
)
from config import settings
from schemas.scoring_schema import ScoreRequest, ScoreResponse
from services.llm_trust_score_service import generate_llm_trust_report
from services.llm_usage_actor import clear_usage_actor, set_usage_actor
from services.scoring_service import (
    build_formula_input_from_payload,
    calculate_vendor_trust_score,
    interpret_trust_score,
)
from services.vts_rationale import print_vts_rationale
from services.vts_vector_retrieval import (
    format_formula_context_for_prompt,
    retrieve_vts_formula_context,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/assessment",
    tags=["Assessment"],
)


def _text(value: object) -> str:
    if value is None:
        return "Not specified"
    if isinstance(value, list):
        parts = [str(x).strip() for x in value if str(x).strip()]
        return ", ".join(parts) if parts else "Not specified"
    s = str(value).strip()
    return s if s else "Not specified"


def _evidence_testing_policy_label(payload: dict) -> str:
    doc_uploads = payload.get("document_uploads")
    if not isinstance(doc_uploads, dict):
        doc_uploads = payload.get("documentUpload")
    if not isinstance(doc_uploads, dict):
        return "Not uploaded"
    raw = doc_uploads.get("evidenceTestingPolicy")
    if isinstance(raw, list):
        names = [str(x).strip() for x in raw if isinstance(x, str) and str(x).strip()]
        if names:
            return ", ".join(names)
    return "Not uploaded"


def _build_evidence_trust_section(payload: dict | None) -> dict:
    """Attestation-only Evidence & Trust — never score-calculation fields."""
    p = payload if isinstance(payload, dict) else {}
    return {
        "id": 11,
        "title": "Evidence & Trust",
        "items": {
            "Usage / Interaction Telemetry": _text(
                p.get("interaction_data_available") or p.get("available_usage_data")
            ),
            "Audit Logs (SIEM Export)": _text(
                p.get("audit_logs_available") or p.get("audit_logs")
            ),
            "Supporting Testing and Policy Documentation": _evidence_testing_policy_label(p),
            "Model / Safety Testing Results (Under NDA)": _text(
                p.get("testing_results_available") or p.get("test_results")
            ),
        },
    }


def _apply_evidence_trust_from_payload(sections: list, payload: dict | None) -> list:
    evidence = _build_evidence_trust_section(payload)
    next_sections = [s for s in sections if not (isinstance(s, dict) and s.get("id") == 11)]
    next_sections.append(evidence)
    next_sections.sort(key=lambda s: int(s.get("id") or 0) if isinstance(s, dict) else 0)
    return next_sections


def _build_sections_from_payload(payload: dict | None) -> list[dict]:
    """Minimal sections so Node can persist a usable report when LLM is unavailable."""
    if not payload or not isinstance(payload, dict):
        return [_build_evidence_trust_section(payload)]
    cp = payload.get("companyProfile") if isinstance(payload.get("companyProfile"), dict) else {}
    product_name = (
        str(payload.get("product_name") or payload.get("productName") or cp.get("productName") or "").strip()
        or "Not specified"
    )
    return [
        {
            "id": 1,
            "title": "Product Information",
            "items": {"Product Name": product_name},
        },
        _build_evidence_trust_section(payload),
    ]


@router.post("/score", response_model=ScoreResponse)
async def score_assessment(body: ScoreRequest) -> ScoreResponse:
    """
    1) Prefer Bedrock LLM for Overall Trust Score + report sections (Node agent behavior).
    2) Always run deterministic formula for PR/GR/OR risk breakdown.
    3) If LLM fails (bad creds / Bedrock error), fall back to formula VTS so Node can still store & display a score.
    """
    try:
        set_usage_actor(
            user_id=body.actor_user_id,
            user_name=body.actor_user_name,
            organization_id=body.actor_organization_id,
            organization_name=body.actor_organization_name,
            feature=body.usage_feature,
        )

        if body.formula_input and isinstance(body.formula_input, dict):
            formula_input = body.formula_input
            payload = body.payload if isinstance(body.payload, dict) else None
        elif body.payload and isinstance(body.payload, dict):
            payload = body.payload
            formula_input = build_formula_input_from_payload(payload)
        else:
            raise_http_exception("payload or formula_input is required", status_code=400)

        formula = calculate_vendor_trust_score(formula_input)
        formula_vts = float(formula.get("vendor_trust_score") or 0)

        vendor_data = (body.vendor_data or "").strip()
        if not vendor_data:
            vendor_data = json.dumps(payload or formula_input, default=str)

        llm_score: float | None = None
        trust_block: dict = {}
        sections: list = []
        raw: str | None = None
        scoring_source = "formula"
        scoring_version = "vts-1.1"
        llm_error: str | None = None
        vector_meta: dict = {"used": False, "chunks": []}
        formula_context = ""
        interpretation_preview = interpret_trust_score(formula_vts)
        formula_categories = {
            "Product": round(max(0.0, min(100.0, 100.0 - float(formula.get("product_risk") or 0))), 2),
            "Governance": round(max(0.0, min(100.0, 100.0 - float(formula.get("governance_risk") or 0))), 2),
            "Operational": round(max(0.0, min(100.0, 100.0 - float(formula.get("operational_risk") or 0))), 2),
        }

        include_formula_ctx = bool(
            getattr(settings, "VTS_LLM_INCLUDE_FORMULA_CONTEXT", False)
        )
        if include_formula_ctx:
            retrieved = retrieve_vts_formula_context(vendor_data)
            formula_context = format_formula_context_for_prompt(
                str(retrieved.get("context_text") or ""),
                "vendor_self_attestation",
            )
            vector_meta = {
                "used": bool(retrieved.get("used")),
                "chunks": list(retrieved.get("chunks") or []),
                "error": retrieved.get("error"),
            }

        # Cap LLM wait so formula VTS still returns before Node's scoring timeout.
        _LLM_TIMEOUT_SEC = int(getattr(settings, "BEDROCK_READ_TIMEOUT", 300) or 300)
        try:
            bound = partial(
                generate_llm_trust_report,
                vendor_data,
                formula_context=formula_context,
                vector_meta=vector_meta,
                formula_vts=formula_vts,
                formula_label=str(interpretation_preview.get("classification") or ""),
                formula_grade=str(interpretation_preview.get("grade") or ""),
                category_scores=formula_categories,
            )
            llm = await asyncio.wait_for(
                asyncio.to_thread(contextvars.copy_context().run, bound),
                timeout=_LLM_TIMEOUT_SEC,
            )
            llm_score = float(llm["overall_score"])
            trust_block = dict(llm.get("trustScore") or {})
            sections = list(llm.get("sections") or [])
            raw = str(llm.get("raw") or "") or None
            scoring_source = "llm+vector" if vector_meta.get("used") else "llm"
            scoring_version = "vts-llm-vector-1.0" if vector_meta.get("used") else "vts-llm-1.0"
        except TokenQuotaExceededError:
            raise
        except asyncio.TimeoutError:
            llm_error = f"LLM trust score timed out after {_LLM_TIMEOUT_SEC}s"
            logger.warning("%s; using formula VTS fallback", llm_error)
        except Exception as exc:
            llm_error = str(exc) or type(exc).__name__
            lowered = llm_error.lower()
            if (
                "token allocation is exhausted" in lowered
                or "token quota is exhausted" in lowered
                or "no tokens have been allocated" in lowered
            ):
                raise TokenQuotaExceededError(llm_error) from exc
            logger.warning("LLM trust score failed; using formula VTS fallback: %s", llm_error)
            logger.debug(traceback.format_exc())

        # Authoritative score follows the explainability document formula:
        # VTS = 100 − [(PR × 0.40) + (GR × 0.30) + (OR × 0.30)]
        # LLM still supplies narrative summary/sections when available.
        final_score = formula_vts
        scoring_source = "formula"
        scoring_version = "vts-1.1"
        if llm_score is not None and llm_score > 0:
            # LLM narrative only — do not override formula VTS.
            scoring_source = "formula+llm-narrative"
            scoring_version = "vts-formula-1.1"

        interpretation = interpretation_preview

        label = str(trust_block.get("label") or "").strip()
        if not label or label == "Not specified":
            trust_block["label"] = interpretation["classification"]
        trust_block["overallScore"] = round(max(0.0, min(100.0, float(final_score))), 2)
        trust_block["grade"] = interpretation["grade"]
        # Always expose formula category scores (higher = better) for Score Trace UI
        trust_block["scoreByCategory"] = {
            "Product": round(max(0.0, min(100.0, 100.0 - float(formula.get("product_risk") or 0))), 2),
            "Governance": round(max(0.0, min(100.0, 100.0 - float(formula.get("governance_risk") or 0))), 2),
            "Operational": round(max(0.0, min(100.0, 100.0 - float(formula.get("operational_risk") or 0))), 2),
        }
        if not str(trust_block.get("summary") or "").strip():
            trust_block["summary"] = (
                f"Vendor trust score {round(max(0.0, min(100.0, float(final_score))), 2):.2f}/100 "
                f"({interpretation['classification']}, grade {interpretation['grade']}). "
                f"Recommended action: {interpretation['recommended_action']}."
            )

        if not sections:
            sections = _build_sections_from_payload(payload)
        # Evidence & Trust must stay attestation-only — drop LLM/score-calculation narrative.
        sections = _apply_evidence_trust_from_payload(sections, payload)

        detail = dict(formula.get("detail") or {})
        detail["llm"] = {
            "overall_score": llm_score,
            "label": trust_block.get("label"),
            "summary": trust_block.get("summary"),
            "scoreByCategory": trust_block.get("scoreByCategory"),
            "error": llm_error,
        }
        detail["formula_vendor_trust_score"] = formula_vts
        detail["vector_retrieval"] = vector_meta
        if "category_coverage_resolution" not in detail and isinstance(formula_input, dict):
            meta = formula_input.get("_categoryCoverageMeta")
            if isinstance(meta, dict) and meta:
                detail["category_coverage_resolution"] = meta

        rationale = print_vts_rationale(
            final_score=final_score,
            scoring_source=scoring_source,
            interpretation=interpretation,
            trust_block=trust_block,
            formula=formula,
            formula_vts=formula_vts,
            llm_score=llm_score,
            payload=payload,
            llm_error=llm_error,
            vector_meta=vector_meta,
        )
        detail["score_rationale"] = rationale

        return ScoreResponse(
            vendor_trust_score=final_score,
            product_risk=float(formula.get("product_risk") or 0),
            governance_risk=float(formula.get("governance_risk") or 0),
            operational_risk=float(formula.get("operational_risk") or 0),
            weighted_risk=float(formula.get("weighted_risk") or 0),
            grade=interpretation["grade"],
            classification=str(trust_block.get("label") or interpretation["classification"]),
            recommended_action=interpretation["recommended_action"],
            detail=detail,
            scoring_version=scoring_version,
            scoring_source=scoring_source,
            formula_vendor_trust_score=formula_vts,
            trust_score=trust_block,
            sections=sections,
            raw=raw,
            rationale=rationale,
        )
    except TokenQuotaExceededError as exc:
        raise_token_quota_http(exc)
    except RiskCalculationException as exc:
        raise_http_exception(exc.message, status_code=400)
    except Exception as exc:
        raise_http_exception(str(exc) or "Scoring failed", status_code=500)
    finally:
        clear_usage_actor()
