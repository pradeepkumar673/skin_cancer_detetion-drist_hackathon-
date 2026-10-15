"""SkinSentry AI Service FastAPI Application.

Implements health checks, request-ID tracing, API key security, structured logging,
and standard JSON error handling.
"""

import importlib.metadata
from io import BytesIO
import json
from pathlib import Path
import platform
import time
from typing import Any, Dict, List, Optional
import uuid

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from PIL import Image
from starlette.exceptions import HTTPException as StarletteHTTPException
import structlog

from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.pipeline.quality import assess_quality
from app.schemas import (
    AnalysisResponse,
    ErrorResponse,
    ExplanationResult,
    HealthResponse,
    ModelStatus,
    PatientContext,
    QualityResult,
)

# Configure structured JSON logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(),
)
logger = structlog.get_logger()

# Initialize settings at startup (fails loudly if configuration is invalid)
settings: Settings = get_settings()

# Initialize FastAPI with CORS disabled (service is private to Node API backend)
app = FastAPI(
    title="SkinSentry AI Service",
    description="Multi-model skin lesion screening and decision support service.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)


@app.middleware("http")
async def request_tracing_and_logging(request: Request, call_next):
    """Assign request ID and log structured request metadata (never bodies or images)."""
    incoming_id = request.headers.get("X-Request-ID")
    request_id = incoming_id if incoming_id else str(uuid.uuid4())
    request.state.request_id = request_id

    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    response.headers["X-Request-ID"] = request_id

    # Structured logging of metadata only
    logger.info(
        "http_request",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
        client_ip=request.client.host if request.client else None,
    )

    return response


# Security dependency requiring X-API-Key matching AI_SERVICE_API_KEY
def verify_api_key(
    request: Request,
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    app_settings: Settings = Depends(get_settings),
) -> str:
    """Validate X-API-Key header against application configuration."""
    request_id = getattr(request.state, "request_id", None)
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "Missing X-API-Key header"},
        )
    if x_api_key != app_settings.AI_SERVICE_API_KEY:
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "Invalid API key"},
        )
    return x_api_key


# Global Exception Handlers returning {"error": code, "message": text, "request_id": id}
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions with uniform JSON schema."""
    request_id = getattr(request.state, "request_id", None)
    if isinstance(exc.detail, dict):
        error_code = exc.detail.get("error", "http_error")
        message = exc.detail.get("message", str(exc.detail))
    else:
        error_code = (
            "unauthorized"
            if exc.status_code == 401
            else "forbidden"
            if exc.status_code == 403
            else "not_found"
            if exc.status_code == 404
            else "http_error"
        )
        message = str(exc.detail)

    return JSONResponse(
        status_code=exc.status_code,
        content={"error": error_code, "message": message, "request_id": request_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle schema validation errors."""
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "message": "Invalid request parameters or payload structure.",
            "request_id": request_id,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Handle unexpected server errors."""
    request_id = getattr(request.state, "request_id", None)
    logger.error("unhandled_exception", request_id=request_id, error=str(exc))
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected server error occurred.",
            "request_id": request_id,
        },
    )


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check and model status",
)
@app.get(
    "/v1/health",
    response_model=HealthResponse,
    include_in_schema=False,
)
async def health_check():
    """Report service health, hardware device, required model file availability, and versions."""
    base_dir = Path(__file__).resolve().parent.parent
    models_path = (base_dir / settings.MODELS_DIR).resolve()

    model_statuses = []
    for model_file in settings.required_model_files:
        full_path = models_path / model_file
        model_statuses.append(
            ModelStatus(name=model_file, exists=full_path.exists())
        )

    # Inspect installed versions of core packages
    package_names = [
        "fastapi",
        "uvicorn",
        "pydantic",
        "pydantic-settings",
        "scikit-learn",
        "xgboost",
        "torch",
        "pillow",
        "structlog",
    ]
    package_versions: Dict[str, str] = {}
    for pkg in package_names:
        try:
            package_versions[pkg] = importlib.metadata.version(pkg)
        except importlib.metadata.PackageNotFoundError:
            package_versions[pkg] = "not_installed"

    return HealthResponse(
        status="ok",
        device=settings.resolved_device,
        models=model_statuses,
        python_version=platform.python_version(),
        package_versions=package_versions,
    )


@app.post(
    "/v1/quality",
    response_model=QualityResult,
    summary="Assess image quality against clinical screening thresholds",
    dependencies=[Depends(verify_api_key)],
)
async def check_image_quality(
    image: UploadFile = File(..., description="Image file to evaluate"),
):
    """Assess image for blur, lighting, contrast, and resolution."""
    try:
        contents = await image.read()
        pil_image = Image.open(BytesIO(contents))
        return assess_quality(pil_image)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_image", "message": f"Failed to process image: {str(e)}"},
        )


@app.post(
    "/v1/analyze",
    response_model=AnalysisResponse,
    summary="Analyze lesion or wound image",
    dependencies=[Depends(verify_api_key)],
    responses={
        413: {"model": ErrorResponse, "description": "File size exceeds limit"},
        415: {"model": ErrorResponse, "description": "Unsupported media type"},
        422: {"model": ErrorResponse, "description": "Invalid input parameters"},
    },
)
async def analyze_image_endpoint(
    request: Request,
    image: UploadFile = File(..., description="Primary clinical lesion or wound image"),
    prior_image: Optional[UploadFile] = File(None, description="Prior image of the same lesion"),
    other_lesion_images: Optional[List[UploadFile]] = File(None, description="Other lesions of the same patient"),
    patient_context: Optional[str] = Form(None, description="JSON string of PatientContext metadata"),
    language: str = "en",
):
    """Execute complete 12-model clinical screening pipeline."""
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    max_bytes = 10 * 1024 * 1024  # 10 MB limit

    # Validate primary image content type
    if image.content_type and image.content_type.lower() not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail={"error": "unsupported_media_type", "message": f"Unsupported media type: {image.content_type}. Expected JPEG or PNG."},
        )

    # Read and validate primary image size
    img_bytes = await image.read()
    if len(img_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail={"error": "payload_too_large", "message": "Image size exceeds 10MB limit."},
        )

    try:
        pil_image = Image.open(BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_image", "message": f"Failed to parse image file: {str(e)}"},
        )

    # Parse prior image if supplied
    pil_prior = None
    if prior_image is not None and prior_image.filename:
        prior_bytes = await prior_image.read()
        if len(prior_bytes) > max_bytes:
            raise HTTPException(status_code=413, detail={"error": "payload_too_large", "message": "Prior image exceeds 10MB limit."})
        try:
            pil_prior = Image.open(BytesIO(prior_bytes)).convert("RGB")
        except Exception:
            pil_prior = None

    # Parse other lesions if supplied
    other_pils: List[Image.Image] = []
    if other_lesion_images:
        for oth_file in other_lesion_images:
            if oth_file and oth_file.filename:
                oth_bytes = await oth_file.read()
                try:
                    other_pils.append(Image.open(BytesIO(oth_bytes)).convert("RGB"))
                except Exception:
                    pass

    # Parse patient context JSON
    context_obj = None
    if patient_context:
        try:
            ctx_data = json.loads(patient_context)
            context_obj = PatientContext(**ctx_data)
        except Exception as e:
            raise HTTPException(
                status_code=422,
                detail={"error": "validation_error", "message": f"Invalid patient_context JSON: {str(e)}"},
            )

    from app.pipeline.orchestrator import run_pipeline_async

    try:
        response = await run_pipeline_async(
            image=pil_image,
            prior_image=pil_prior,
            other_lesion_images=other_pils if other_pils else None,
            patient_context=context_obj,
            request_id=request_id,
            language=language,
        )
        return response
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error("pipeline_execution_error", request_id=request_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail={"error": "pipeline_error", "message": f"Clinical screening pipeline error: {str(e)}"},
        )


class ExplainRequest(BaseModel):
    """Payload for POST /v1/explain."""

    result: Dict[str, Any] = Field(..., description="Structured analysis result dictionary")
    language: str = Field("en", description="Target explanation language: en, ta, hi")


@app.post(
    "/v1/explain",
    response_model=ExplanationResult,
    tags=["Explanation"],
    summary="Generate clinical explanation from structured analysis results",
    dependencies=[Depends(verify_api_key)],
)
async def explain_endpoint(
    request: ExplainRequest,
) -> ExplanationResult:
    """Generate or translate clinical explanation from structured facts without raw image data."""
    from app.llm.service import get_explanation_service

    service = get_explanation_service()
    explanation = await service.generate_explanation(
        result=request.result,
        language=request.language,
    )
    return explanation


@app.get(
    "/v1/metrics",
    tags=["Metrics"],
    summary="Get aggregated model evaluation metrics and provenance",
)
async def get_metrics() -> Dict[str, Any]:
    """Return aggregated model evaluation metrics and provenance."""
    summary_path = Path(__file__).resolve().parent.parent.parent / "models" / "metrics" / "summary.json"
    if not summary_path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "Metrics summary not found. Run evaluate.py first."},
        )
    with open(summary_path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.on_event("startup")
async def verify_external_services():
    """Verify external model and API configurations on startup."""
    from app.llm.groq_client import GroqClient

    client = GroqClient()
    if client.is_configured:
        await client.verify_model_available()

