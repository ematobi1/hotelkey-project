"""
Core pricing service — orchestrates RL agent, signals, guardrails, circuit breaker.
"""
import structlog
from datetime import date

from ..config import settings
from ..models.ppo_agent import PricingAgent, PricingState
from .circuit_breaker import circuit_breaker
from .guardrails import RateGuardrails
from .signal_reader import collect_all_signals

logger = structlog.get_logger()


class PricingService:
    def __init__(self) -> None:
        self.agent = PricingAgent()
        self._manual_overrides: dict[tuple[str, str], float] = {}
        self._autonomy_enabled: dict[str, bool] = {}

    def set_autonomy(self, tenant_id: str, enabled: bool) -> None:
        self._autonomy_enabled[tenant_id] = enabled
        logger.info("autonomy_toggled", tenant_id=tenant_id, enabled=enabled)

    def is_autonomous(self, tenant_id: str) -> bool:
        if circuit_breaker.is_paused(tenant_id):
            return False
        return self._autonomy_enabled.get(tenant_id, False)

    def set_manual_override(
        self,
        tenant_id: str,
        room_type: str,
        rate: float,
        floor_rate: float,
        ceiling_rate: float,
    ) -> None:
        _, violations = RateGuardrails.apply(rate, rate, floor_rate, ceiling_rate)
        if violations:
            raise ValueError(f"Rate violates guardrails: {violations}")
        self._manual_overrides[(tenant_id, room_type)] = rate
        logger.info("manual_override_set", tenant_id=tenant_id, room_type=room_type, rate=rate)

    def clear_override(self, tenant_id: str, room_type: str) -> None:
        self._manual_overrides.pop((tenant_id, room_type), None)

    async def get_recommendation(
        self,
        tenant_id: str,
        room_type: str,
        current_rate: float,
        floor_rate: float,
        ceiling_rate: float,
        target_date: date,
    ) -> dict:
        if circuit_breaker.is_paused(tenant_id):
            return {
                'rate': current_rate,
                'autonomous': False,
                'reason': 'circuit_breaker_open',
                'circuit_breaker': circuit_breaker.status(tenant_id),
            }

        override = self._manual_overrides.get((tenant_id, room_type))
        if override is not None:
            return {
                'rate': override,
                'autonomous': False,
                'reason': 'manual_override',
                'model_version': None,
            }

        signals = await collect_all_signals(tenant_id, target_date)

        state = PricingState()
        state.occupancy_rate = 0.70  # populated from reservation-service in production
        state.days_ahead = max(0, (target_date - date.today()).days)
        state.day_of_week = target_date.weekday()
        state.competitor_rate_ratio = current_rate / max(signals['competitor_avg_rate'], 1.0)
        state.demand_index = signals['demand_index']
        state.current_rate = current_rate
        state.floor_rate = floor_rate
        state.ceiling_rate = ceiling_rate

        multiplier = self.agent.select_action(state)
        proposed_rate = current_rate * multiplier

        final_rate, violations = RateGuardrails.apply(
            proposed_rate,
            current_rate,
            floor_rate,
            ceiling_rate,
            settings.max_daily_rate_delta_pct,
        )

        return {
            'rate': final_rate,
            'autonomous': self.is_autonomous(tenant_id),
            'model_version': self.agent.model_version,
            'multiplier_applied': multiplier,
            'signals': signals,
            'guardrail_violations': violations,
            'reason': 'rl_agent' if not violations else 'rl_agent_guardrailed',
        }


# Singleton
pricing_service = PricingService()
