"""
APScheduler job that polls demand signals every 30 minutes and updates recommendations.
"""
from datetime import date, timedelta

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from ..config import settings
from ..services.circuit_breaker import circuit_breaker
from ..services.signal_reader import collect_all_signals

logger = structlog.get_logger()
scheduler = AsyncIOScheduler()

# In-memory latest signals cache: "{tenant_id}:{date}" -> signals dict
_latest_signals: dict[str, dict] = {}


async def poll_signals() -> None:
    """Called every 30 minutes. Check circuit breakers and refresh demand signals."""
    from ..services.pricing import pricing_service

    logger.info("signal_polling_cycle_start")
    tenants = list(pricing_service._autonomy_enabled.keys())
    if not tenants:
        return

    for tenant_id in tenants:
        await circuit_breaker.check_revpar(tenant_id)
        for i in range(7):
            target = date.today() + timedelta(days=i)
            signals = await collect_all_signals(tenant_id, target)
            _latest_signals[f"{tenant_id}:{target}"] = signals

    logger.info("signal_polling_cycle_complete", tenants=len(tenants))


def start_scheduler() -> None:
    scheduler.add_job(
        poll_signals,
        trigger=IntervalTrigger(seconds=settings.signal_poll_interval_seconds),
        id='signal_polling',
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
