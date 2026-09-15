"""
Type 2 (cots_vendor) and Type 3 (cots_buyer) formula scoring.
Formulas live in Python (same ownership model as VTS /assessment/score).
Node calls these endpoints and persists. Numeric math is deterministic in code.
"""

from __future__ import annotations

import logging
import traceback
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from exceptions.custom_exceptions import raise_http_exception
from services.buyer_implementation_risk_formula import (
    calculate_buyer_implementation_risk_score,
)
from services.sales_risk_formula import (
    build_sales_risk_formula_input,
    calculate_sales_risk_score,
)
from services.score_rationale import print_irs_rationale, print_srs_rationale

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/assessment",
    tags=["Assessment"],
)


class CotsVendorScoreRequest(BaseModel):
    payload: dict[str, Any] | None = None
    formula_input: dict[str, Any] | None = None


class CotsBuyerScoreRequest(BaseModel):
    buyer_payload: dict[str, Any] = Field(default_factory=dict)
    attestation_row: dict[str, Any] | None = None
    vendor_name: str = "Vendor"
    product_name: str = "Product"


@router.post("/cots-vendor/score")
async def score_cots_vendor(body: CotsVendorScoreRequest) -> dict[str, Any]:
    """Sales Risk Score (Type 2) — deterministic formula owned by Python."""
    try:
        if body.formula_input and isinstance(body.formula_input, dict):
            formula_input = body.formula_input
        elif body.payload and isinstance(body.payload, dict):
            formula_input = build_sales_risk_formula_input(body.payload)
        else:
            raise_http_exception("payload or formula_input is required", status_code=400)

        result = calculate_sales_risk_score(formula_input)
        srs = float(result.get("sales_risk_score") or 0)
        print(f"srs {srs}", flush=True)
        rationale = print_srs_rationale(
            result=result,
            formula_input=formula_input,
            payload=body.payload if isinstance(body.payload, dict) else None,
        )
        scoring_source = str(result.get("scoring_source") or "formula")
        return {
            **result,
            "scoring_source": scoring_source,
            "scoring_version": "scs-2.0",
            "rationale": rationale,
        }
    except Exception as exc:
        logger.error("cots-vendor score failed: %s\n%s", exc, traceback.format_exc())
        raise_http_exception(str(exc) or "cots-vendor scoring failed", status_code=500)


@router.post("/cots-buyer/score")
async def score_cots_buyer(body: CotsBuyerScoreRequest) -> dict[str, Any]:
    """Buyer Implementation Risk Score (Type 3) — deterministic formula owned by Python."""
    try:
        buyer_payload = body.buyer_payload if isinstance(body.buyer_payload, dict) else {}
        attestation = body.attestation_row if isinstance(body.attestation_row, dict) else None
        result = calculate_buyer_implementation_risk_score(
            buyer_payload,
            attestation,
            body.vendor_name or "Vendor",
            body.product_name or "Product",
        )
        irs = float(result.get("implementationRiskScore") or 0)
        print(f"irs {irs}", flush=True)
        rationale = print_irs_rationale(result=result, buyer_payload=buyer_payload)
        return {
            **result,
            "scoring_source": "formula",
            "scoring_version": "irs-2.0",
            "rationale": rationale,
        }
    except Exception as exc:
        logger.error("cots-buyer score failed: %s\n%s", exc, traceback.format_exc())
        raise_http_exception(str(exc) or "cots-buyer scoring failed", status_code=500)
