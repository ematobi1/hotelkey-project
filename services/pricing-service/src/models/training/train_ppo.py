"""
PPO training script using Ray RLlib.
Run this before production deployment.

Usage:
    python -m src.models.training.train_ppo --hotel-id <tenant_id>
    python -m src.models.training.train_ppo --hotel-id demo-hotel --iterations 200
"""
import argparse
import os

import mlflow
import numpy as np
import pandas as pd
import ray
from ray.rllib.algorithms.ppo import PPOConfig

from .replay_simulator import ReplayEnvironment


def generate_synthetic_history(n_days: int = 365) -> pd.DataFrame:
    """Generate synthetic training data when no historical data is available."""
    np.random.seed(42)
    dates = pd.date_range(start='2024-01-01', periods=n_days, freq='D')
    return pd.DataFrame({
        'date': dates,
        'occupancy_rate': np.clip(
            0.65 + 0.15 * np.sin(np.arange(n_days) * 2 * np.pi / 7) + np.random.randn(n_days) * 0.08,
            0.1, 0.99,
        ),
        'revpar': 90 + 30 * np.random.randn(n_days),
        'day_of_week': [d.weekday() for d in dates],
        'days_ahead': np.random.randint(0, 30, n_days),
        'competitor_rate_ratio': 0.95 + 0.1 * np.random.randn(n_days),
        'demand_index': np.clip(0.5 + np.random.randn(n_days) * 0.2, 0, 1),
    })


def train(hotel_id: str, n_iterations: int = 100) -> None:
    ray.init(ignore_reinit_error=True)

    history_df = generate_synthetic_history()

    mlflow.set_tracking_uri(os.environ.get('MLFLOW_URI', 'http://localhost:5000'))
    with mlflow.start_run(run_name=f"ppo-training-{hotel_id}"):
        mlflow.log_param('hotel_id', hotel_id)
        mlflow.log_param('n_iterations', n_iterations)
        mlflow.log_param('algorithm', 'PPO')

        config = (
            PPOConfig()
            .environment(
                env=ReplayEnvironment,
                env_config={
                    'history_df': history_df,
                    'floor_rate': 80.0,
                    'ceiling_rate': 500.0,
                },
            )
            .training(lr=3e-4, gamma=0.99, lambda_=0.95, clip_param=0.2, num_sgd_iter=10)
            .rollouts(num_rollout_workers=2)
            .resources(num_gpus=0)
        )

        algo = config.build()
        best_reward = float('-inf')

        for i in range(n_iterations):
            result = algo.train()
            reward = result['episode_reward_mean']
            mlflow.log_metric('episode_reward_mean', reward, step=i)
            if reward > best_reward:
                best_reward = reward
                checkpoint_dir = f'./checkpoints/{hotel_id}'
                algo.save(checkpoint_dir)
                print(f"Iteration {i}: reward={reward:.3f} (new best) — checkpoint saved")

        mlflow.log_metric('best_reward', best_reward)
        mlflow.log_artifact(f'./checkpoints/{hotel_id}')
        print(f"Training complete. Best reward: {best_reward:.3f}")

    ray.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train PPO pricing agent')
    parser.add_argument('--hotel-id', required=True, help='Tenant/hotel identifier')
    parser.add_argument('--iterations', type=int, default=100, help='Number of training iterations')
    args = parser.parse_args()
    train(args.hotel_id, args.iterations)
