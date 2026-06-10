import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from prometheus_client import make_asgi_app
from .routers import housekeeping, maintenance, staffing, occupancy
from .config import settings

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('ml-service starting', port=settings.port, shadow_mode=settings.shadow_mode)
    yield
    logger.info('ml-service shutting down')


app = FastAPI(title='Hotel Key ML Service', version='1.0.0', lifespan=lifespan)

app.include_router(housekeeping.router)
app.include_router(maintenance.router)
app.include_router(staffing.router)
app.include_router(occupancy.router)

metrics_app = make_asgi_app()
app.mount('/metrics', metrics_app)


@app.get('/health')
async def health():
    return {'status': 'ok', 'shadow_mode': settings.shadow_mode}
