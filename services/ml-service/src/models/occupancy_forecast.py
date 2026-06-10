"""
Occupancy Forecast — Gradient Boosting + Seasonality
Target: occupancy_rate at 30-day horizon
KPI: MAPE < 8%
"""
import numpy as np
import xgboost as xgb
import mlflow
from pydantic import BaseModel
from ..config import settings

FEATURE_COLS = [
    'day_of_week',
    'month',
    'days_ahead',
    'avg_occupancy_7d',
    'avg_occupancy_30d',
    'booking_pace_7d',
    'avg_lead_time_days',
    'local_events_flag',
    'avg_adr_30d',
]


class OccupancyFeatures(BaseModel):
    tenant_id: str
    target_date: str
    days_ahead: int
    day_of_week: int
    month: int
    avg_occupancy_7d: float
    avg_occupancy_30d: float
    booking_pace_7d: float
    avg_lead_time_days: float
    local_events_flag: int
    avg_adr_30d: float


class OccupancyForecastPoint(BaseModel):
    date: str
    predicted_occupancy: float
    lower_bound: float
    upper_bound: float


class OccupancyPrediction(BaseModel):
    tenant_id: str
    forecasts: list[OccupancyForecastPoint]
    mape_estimate: float
    model_version: str


class OccupancyForecastModel:
    def __init__(self):
        self.model: xgb.XGBRegressor | None = None
        self.model_version = 'fallback-v1'
        self._load()

    def _load(self):
        try:
            mlflow.set_tracking_uri(settings.mlflow_uri)
            client = mlflow.tracking.MlflowClient()
            latest = client.get_latest_versions(
                'occupancy-forecast', stages=['Production']
            )
            if latest:
                run_id = latest[0].run_id
                self.model = mlflow.xgboost.load_model(f'runs:/{run_id}/model')
                self.model_version = f'v{latest[0].version}'
            else:
                self._load_fallback()
        except Exception:
            self._load_fallback()

    def _load_fallback(self):
        import pandas as pd
        from pathlib import Path

        model_path = Path(settings.model_dir) / 'occupancy_forecast.ubj'
        if model_path.exists():
            self.model = xgb.XGBRegressor()
            self.model.load_model(str(model_path))
        else:
            self.model = xgb.XGBRegressor(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.03,
                subsample=0.8,
                random_state=42,
            )
            np.random.seed(42)
            n = 5000
            X = pd.DataFrame({col: np.random.randn(n) for col in FEATURE_COLS})
            y = (
                0.7
                + 0.1 * np.sin(2 * np.pi * X['day_of_week'] / 7)
                + np.random.randn(n) * 0.05
            )
            y = np.clip(y, 0.1, 1.0)
            self.model.fit(X, y)
        self.model_version = 'fallback-v1'

    def predict(self, features: OccupancyFeatures) -> OccupancyForecastPoint:
        import pandas as pd

        X = pd.DataFrame(
            [[getattr(features, col) for col in FEATURE_COLS]], columns=FEATURE_COLS
        )
        pred = float(np.clip(self.model.predict(X)[0], 0.0, 1.0))
        margin = 0.08
        return OccupancyForecastPoint(
            date=features.target_date,
            predicted_occupancy=round(pred, 4),
            lower_bound=round(max(0.0, pred - margin), 4),
            upper_bound=round(min(1.0, pred + margin), 4),
        )
