"""
PPO (Proximal Policy Optimisation) pricing agent using Ray RLlib.
The agent learns to maximize RevPAR by adjusting room rates.

Observation space: [occupancy_rate, days_ahead, day_of_week, competitor_rate_ratio,
                    demand_index, current_rate, floor_rate, ceiling_rate]
Action space: Discrete(9) — rate multipliers: [0.75, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.25]
Reward: RevPAR delta vs. prior period (normalized)
"""
import numpy as np
from pathlib import Path

MULTIPLIERS = [0.75, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.25]


class PricingState:
    """Current state observed by the PPO agent."""

    occupancy_rate: float        # 0.0–1.0
    days_ahead: int              # 0–90 days until the rate period
    day_of_week: int             # 0=Mon, 6=Sun
    competitor_rate_ratio: float # our rate / avg competitor rate
    demand_index: float          # normalized demand signal (0–1)
    current_rate: float          # current nightly rate in USD
    floor_rate: float            # hard minimum rate
    ceiling_rate: float          # hard maximum rate

    def to_array(self) -> np.ndarray:
        return np.array([
            self.occupancy_rate,
            self.days_ahead / 90.0,
            self.day_of_week / 6.0,
            min(self.competitor_rate_ratio, 2.0),
            self.demand_index,
            self.current_rate / 500.0,
            self.floor_rate / 500.0,
            self.ceiling_rate / 500.0,
        ], dtype=np.float32)


class PricingAgent:
    """Wraps a trained RLlib PPO policy for inference."""

    def __init__(self, model_path: str | None = None):
        self.policy = None
        self.model_version = 'fallback-v1'
        self._load(model_path)

    def _load(self, model_path: str | None) -> None:
        """Try to load from a checkpoint path, fall back to rule-based if unavailable."""
        try:
            if model_path and Path(model_path).exists():
                import ray
                from ray.rllib.policy.policy import Policy
                ray.init(ignore_reinit_error=True, local_mode=True)
                self.policy = Policy.from_checkpoint(model_path)
                self.model_version = 'ppo-checkpoint'
                return
        except Exception:
            pass
        self.policy = None
        self.model_version = 'rule-based-v1'

    def select_action(self, state: PricingState) -> float:
        """Returns a rate multiplier (e.g., 1.10 = +10%)."""
        if self.policy is not None:
            obs = state.to_array()
            action = self.policy.compute_single_action(obs)[0]
            return MULTIPLIERS[int(action)]

        # Rule-based fallback: high demand → higher rate, low demand → lower rate
        if state.occupancy_rate > 0.85:
            return 1.15
        elif state.occupancy_rate > 0.70:
            return 1.05
        elif state.occupancy_rate < 0.40:
            return 0.90
        return 1.00
