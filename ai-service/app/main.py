"""SkinSentry AI Service FastAPI Application.

Implements health checks, request-ID tracing, API key security, structured logging,
and standard JSON error handling.
"""

import importlib.metadata
import platform
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
import structlog

from app.config import Settings, get_settings
from app.schemas import ErrorResponse, HealthResponse, ModelStatus

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
    "/v1/analyze",
    summary="Analyze lesion or wound image",
    dependencies=[Depends(verify_api_key)],
    responses={
        503: {"model": ErrorResponse, "description": "Models are not loaded yet"}
    },
)
async def analyze_image(request: Request):
    """Pipeline endpoint. Returns HTTP 503 until models are loaded in Step 15."""
    request_id = getattr(request.state, "request_id", None)
    raise HTTPException(
        status_code=503,
        detail={"error": "models_not_loaded", "message": "Models are not loaded yet."},
    )
