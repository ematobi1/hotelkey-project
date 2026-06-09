"""
Historical replay simulator for pre-production PPO training.
Replays historical booking data as environment transitions.
"""
import numpy as np
import pandas as pd
import gymnasium as gym


class ReplayEnvironment(gym.Env):
    """
    Gymnasium-compatible environment that replays historical hotel data.
    Used to train the PPO agent before production deployment.
    """

    metadata = {'render_modes': []}

    def __init__(self, history_df: pd.DataFrame, floor_rate: float = 80.0, ceiling_rate: float = 500.0):
        super().__init__()
        self.history = history_df.reset_index(drop=True)
        self.floor_rate = floor_rate
        self.ceiling_rate = ceiling_rate
        self.current_idx = 0
        self.current_rate = 150.0

        self.observation_space = gym.spaces.Box(low=0.0, high=2.0, shape=(8,), dtype=np.float32)
        self.action_space = gym.spaces.Discrete(9)  # 9 multipliers

    def reset(self, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        self.current_idx = 0
        self.current_rate = 150.0
        obs = self._make_obs(self.history.iloc[0])
        return obs, {}

    def step(self, action: int):
        multipliers = [0.75, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.25]
        multiplier = multipliers[int(action)]

        row = self.history.iloc[self.current_idx]
        new_rate = float(np.clip(self.current_rate * multiplier, self.floor_rate, self.ceiling_rate))

        historical_revpar = float(row.get('revpar', 100.0))
        simulated_revpar = new_rate * float(row.get('occupancy_rate', 0.7))
        reward = (simulated_revpar - historical_revpar) / max(historical_revpar, 1.0)

        self.current_rate = new_rate
        self.current_idx = min(self.current_idx + 1, len(self.history) - 1)
        done = self.current_idx >= len(self.history) - 1

        next_obs = self._make_obs(self.history.iloc[self.current_idx])
        return next_obs, reward, done, False, {}

    def _make_obs(self, row: pd.Series) -> np.ndarray:
        return np.array([
            float(row.get('occupancy_rate', 0.7)),
            float(row.get('days_ahead', 7)) / 90.0,
            float(row.get('day_of_week', 0)) / 6.0,
            float(row.get('competitor_rate_ratio', 1.0)),
            float(row.get('demand_index', 0.5)),
            self.current_rate / 500.0,
            self.floor_rate / 500.0,
            self.ceiling_rate / 500.0,
        ], dtype=np.float32)
