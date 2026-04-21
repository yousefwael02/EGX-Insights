import asyncio
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pythonjsonlogger import jsonlogger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.database import close_client, get_client
from app.routes import auth, market, portfolio, stocks, watchlist

_handler = logging.StreamHandler()
_handler.setFormatter(
    jsonlogger.JsonFormatter("%(asctime)s %(name)s %(levelname)s %(message)s")
)
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="EGX StockInsight API",
    description=(
        "Live Egyptian Exchange (EGX) market data powered by Yahoo Finance "
        "and Gemini AI insights."
    ),
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.include_router(auth.router)
app.include_router(stocks.router)
app.include_router(market.router)
app.include_router(portfolio.router)
app.include_router(watchlist.router)


@app.get("/")
async def root():
    return {"status": "running", "exchange": "EGX", "version": "1.0.0"}


@app.get("/healthz")
@limiter.limit("30/minute")
async def healthz(request: Request):
    _ = request
    return {"status": "ok"}


@app.get("/readyz")
@limiter.limit("30/minute")
async def readyz(request: Request):
    _ = request
    try:
        await get_client().admin.command("ping")
        return {"status": "ready", "database": "ok"}
    except Exception as exc:
        logger.error("Readiness probe failed: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "unreachable"},
        )


@app.on_event("startup")
async def startup():
    """Verify MongoDB connection and pre-populate the stock quote cache."""
    try:
        await get_client().admin.command("ping")
        logger.info("MongoDB connection established.")
    except Exception as exc:
        logger.error("MongoDB connection failed: %s", exc)

    async def _warmup():
        await asyncio.sleep(2)
        logger.info("Starting EGX stock cache warmup…")
        try:
            await stocks.get_all_stocks()
            logger.info("Cache warmup complete.")
        except Exception as exc:
            logger.error("Cache warmup failed: %s", exc)

    asyncio.create_task(_warmup())


@app.on_event("shutdown")
async def shutdown():
    await close_client()
