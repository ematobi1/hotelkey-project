"""
Demand signal reader — runs every 30 minutes.
Reads: PredictHQ local events, competitor rates, booking pace.
"""
import asyncio
import random
from datetime import date, timedelta
from typing import Optional

import httpx
import structlog

from ..config import settings

logger = structlog.get_logger()


async def _fetch_json(client: httpx.AsyncClient, url: str, headers: dict | None = None) -> Optional[dict]:
    try:
        resp = await client.get(url, headers=headers or {}, timeout=10.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("signal_fetch_failed", url=url, error=str(e))
        return None


async def get_local_events(tenant_id: str, city: str, check_date: date) -> list[dict]:
    """
    Fetch local events from PredictHQ that may spike hotel demand.
    Falls back to empty list if API key not configured.
    """
    if not settings.predicthq_api_key:
        return []

    end_date = check_date + timedelta(days=7)
    url = (
        f"https://api.predicthq.com/v1/events/"
        f"?location_around.origin={city}"
        f"&start.gte={check_date}"
        f"&start.lte={end_date}"
        f"&category=concerts,sports,community"
        f"&rank.gte=50"
    )

    async with httpx.AsyncClient() as client:
        data = await _fetch_json(
            client,
            url,
            headers={"Authorization": f"Bearer {settings.predicthq_api_key}"},
        )

    if not data:
        return []

    return [
        {'name': e.get('title'), 'date': e.get('start'), 'impact': e.get('rank', 0)}
        for e in data.get('results', [])
    ]


async def get_competitor_rates(tenant_id: str, room_type: str, check_date: date) -> float:
    """
    Returns average competitor nightly rate for the given date.
    In production: integrate with OTA scraping or RateGain/Duetto API.
    Returns mock data for now.
    """
    rng = random.Random(hash(f"{tenant_id}{room_type}{check_date}"))
    base = 180.0
    if check_date.weekday() >= 4:  # weekend premium
        base *= 1.15
    return round(base + rng.uniform(-20, 20), 2)


async def get_booking_pace(tenant_id: str, target_date: date) -> dict:
    """
    Reads booking pace from reservation-service — bookings made in last 7 days for target_date.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{settings.reservation_service_url}/v1/reservations"
                f"?tenantId={tenant_id}&checkInDate={target_date}",
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                total = data.get('meta', {}).get('total', 0)
                return {'bookings_7d': total, 'target_date': str(target_date)}
    except Exception as e:
        logger.warning("booking_pace_fetch_failed", error=str(e))

    return {'bookings_7d': 0, 'target_date': str(target_date)}


async def collect_all_signals(tenant_id: str, target_date: date) -> dict:
    """Collect all demand signals in parallel for the 30-minute polling cycle."""
    events, comp_rate, pace = await asyncio.gather(
        get_local_events(tenant_id, 'unknown', target_date),
        get_competitor_rates(tenant_id, 'standard', target_date),
        get_booking_pace(tenant_id, target_date),
    )

    demand_index = min(1.0, (pace['bookings_7d'] / 50) + (len(events) * 0.1))

    return {
        'tenant_id': tenant_id,
        'target_date': str(target_date),
        'local_events': events,
        'competitor_avg_rate': comp_rate,
        'booking_pace_7d': pace['bookings_7d'],
        'demand_index': demand_index,
    }
