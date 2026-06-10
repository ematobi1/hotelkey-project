from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from .config import settings
from .jobs.signal_polling_job import start_scheduler, stop_scheduler
from .routers.pricing import router as pricing_router

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("pricing-service starting", port=settings.port)
    start_scheduler()
    yield
    stop_scheduler()
    logger.info("pricing-service stopped")


app = FastAPI(
    title='Hotel Key Pricing Service',
    version='1.0.0',
    lifespan=lifespan,
)

app.include_router(pricing_router)


@app.get('/health')
async def health():
    return {'status': 'ok', 'service': 'pricing-service'}
