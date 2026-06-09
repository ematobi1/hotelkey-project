"""
Hard rate guardrails — enforced on every rate recommendation regardless of RL agent output.
"""


class RateGuardrails:
    """
    Rule-based hard limits applied AFTER the RL agent produces a recommendation.
    These cannot be overridden by the RL agent — only by a manager.
    """

    @staticmethod
    def apply(
        proposed_rate: float,
        current_rate: float,
        floor_rate: float,
        ceiling_rate: float,
        max_daily_delta_pct: float = 0.25,
    ) -> tuple[float, list[str]]:
        """
        Returns (adjusted_rate, list_of_guardrail_violations_triggered).
        Rules are applied in order; each may further constrain the rate.
        """
        violations: list[str] = []
        rate = proposed_rate

        # Rule 1: Floor — rate cannot go below cost-per-room
        if rate < floor_rate:
            violations.append(f"floor_rate: proposed ${rate:.2f} below floor ${floor_rate:.2f}")
            rate = floor_rate

        # Rule 2: Ceiling — cannot exceed hotel config maximum
        if rate > ceiling_rate:
            violations.append(f"ceiling_rate: proposed ${rate:.2f} above ceiling ${ceiling_rate:.2f}")
            rate = ceiling_rate

        # Rule 3: Max ±25% daily delta
        max_delta = current_rate * max_daily_delta_pct
        if abs(rate - current_rate) > max_delta:
            if rate > current_rate:
                rate = current_rate + max_delta
                violations.append(f"max_daily_delta: capped increase at +{max_daily_delta_pct * 100:.0f}%")
            else:
                rate = current_rate - max_delta
                violations.append(f"max_daily_delta: capped decrease at -{max_daily_delta_pct * 100:.0f}%")

        return round(rate, 2), violations
