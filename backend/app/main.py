import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router
from app.core.config import FRONTEND_ORIGINS
from app.schemas import AnalysisResponse, HealthResponse

logger = logging.getLogger(__name__)

app = FastAPI(title="NyayaDari API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    messages = [error.get("msg", "Invalid request.") for error in exc.errors()]
    response = AnalysisResponse(
        success=False,
        originalIssue=None,
        jurisdiction=None,
        error="; ".join(messages),
    )
    return JSONResponse(status_code=422, content=response.model_dump())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    error = (
        exc.detail
        if isinstance(exc.detail, str)
        else "The request could not be completed."
    )
    response = AnalysisResponse(
        success=False,
        originalIssue=None,
        jurisdiction=None,
        error=error,
    )
    return JSONResponse(status_code=exc.status_code, content=response.model_dump())


@app.exception_handler(Exception)
async def unexpected_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.error(
        "Unhandled error while processing %s",
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    response = AnalysisResponse(
        success=False,
        originalIssue=None,
        jurisdiction=None,
        error="An unexpected server error occurred.",
    )
    return JSONResponse(status_code=500, content=response.model_dump())
