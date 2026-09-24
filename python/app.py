from fastapi import FastAPI

from api.health import router as health_router
from api.scoring import router as scoring_router
from api.assessment_llm import router as assessment_llm_router
from api.cots_scoring import router as cots_scoring_router
from api.config_llm import router as config_llm_router

from config import aws_credentials_configured, get_bedrock_model_id, settings

app = FastAPI(
    title=settings.APP_NAME
)

if not aws_credentials_configured():
    # Without credentials the LLM leg of /assessment/score fails and profile reports
    # degrade to a single stub section, so make it loud at startup.
    print(
        "[warn] No AWS credentials found — Bedrock calls will fail and VTS will "
        "fall back to formula-only scoring. Set AWS_ACCESS_KEY_ID / "
        "AWS_SECRET_ACCESS_KEY in python/.env.",
        flush=True,
    )
else:
    print(f"[LLM] Bedrock configured for model: {get_bedrock_model_id()}", flush=True)

app.include_router(health_router)
app.include_router(scoring_router)
app.include_router(assessment_llm_router)
app.include_router(cots_scoring_router)
app.include_router(config_llm_router)

try:
    from api.assessment import router as assessment_router
    app.include_router(assessment_router)
except Exception as exc:
    # Extraction stack is optional; scoring still runs without langchain/boto/docs deps.
    print(f"[warn] assessment router not loaded: {exc}")


@app.get("/")
def root():
    return {
        "application": settings.APP_NAME,
        "status": "Running"
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=5004, reload=True)