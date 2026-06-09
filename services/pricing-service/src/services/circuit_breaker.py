"""
Circuit breaker — pauses autonomous pricing if RevPAR drops > 15% vs. prior week.
"""
from datetime import date, timedelta

import httpx
import structlog

from ..config import settings

logger = structlog.get_logger()


class CircuitBreaker:
    def __init__(self) -> None:
        self._open: dict[str, bool] = {}         # tenant_id -> is_paused
        self._pause_reasons: dict[str, str] = {}  # tenant_id -> reason

    def is_paused(self, tenant_id: str) -> bool:
        return self._open.get(tenant_id, False)

    def pause(self, tenant_id: str, reason: str) -> None:
        self._open[tenant_id] = True
        self._pause_reasons[tenant_id] = reason
        logger.warning("circuit_breaker_opened", tenant_id=tenant_id, reason=reason)

    def resume(self, tenant_id: str) -> None:
        self._open[tenant_id] = False
        self._pause_reasons.pop(tenant_id, None)
        logger.info("circuit_breaker_closed", tenant_id=tenant_id)

    def status(self, tenant_id: str) -> dict:
        return {
            'paused': self.is_paused(tenant_id),
            'reason': self._pause_reasons.get(tenant_id),
        }

    async def check_revpar(self, tenant_id: str) -> None:
        """Check if RevPAR dropped > threshold vs prior week. Opens circuit if so."""
        try:
            today = date.today()
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{settings.billing_service_url}/v1/billing/revpar"
                    f"?tenantId={tenant_id}"
                    f"&from={today - timedelta(days=7)}&to={today}"
                )
                if resp.status_code != 200:
                    return
                current_revpar = resp.json().get('data', {}).get('revpar', 0)

                resp2 = await client.get(
                    f"{settings.billing_service_url}/v1/billing/revpar"
                    f"?tenantId={tenant_id}"
                    f"&from={today - timedelta(days=14)}&to={today - timedelta(days=7)}"
                )
                if resp2.status_code != 200:
                    return
                prior_revpar = resp2.json().get('data', {}).get('revpar', 0)

                if prior_revpar > 0 and current_revpar < prior_revpar * (1 - settings.revpar_drop_threshold):
                    drop_pct = (prior_revpar - current_revpar) / prior_revpar * 100
                    self.pause(
                        tenant_id,
                        f"RevPAR dropped {drop_pct:.1f}% vs prior week "
                        f"(threshold: {settings.revpar_drop_threshold * 100:.0f}%)",
                    )
        except Exception as e:
            logger.warning("revpar_check_failed", error=str(e))


# Singleton instance
circuit_breaker = CircuitBreaker()
