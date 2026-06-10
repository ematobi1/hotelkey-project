"""
Housekeeping Workload Forecast — XGBoost Regressor + SHAP
Target: minutes per room to clean
KPI: MAE < 8 minutes per room
"""
import numpy as np
import xgboost as xgb
import shap
import mlflow
from pydantic import BaseModel
from pathlib import Path
from ..config import settings

FEATURE_COLS = [
    'hour_of_day',
    'day_of_week',
    'occupancy_rate',
    'checkouts_today',
    'avg_task_duration_7d',
    'tasks_in_progress',
    'staff_on_duty',
]


class HousekeepingFeatures(BaseModel):
    tenant_id: str
    hour_of_day: int
    day_of_week: int
    occupancy_rate: float
    checkouts_today: int
    avg_task_duration_7d: float
    tasks_in_progress: int
    staff_on_duty: int


class HousekeepingPrediction(BaseModel):
    predicted_minutes_per_room: float
    confidence_interval_low: float
    confidence_interval_high: float
    shap_values: dict[str, float]
    model_version: str


class HousekeepingWorkloadModel:
    def __init__(self):
        self.model: xgb.XGBRegressor | None = None
        self.explainer: shap.TreeExplainer | None = None
        self.model_version: str = 'fallback-v1'
        self._load()

    def _load(self):
        try:
            mlflow.set_tracking_uri(settings.mlflow_uri)
            client = mlflow.tracking.MlflowClient()
            latest = client.get_latest_versions(
                'housekeeping-workload-forecast', stages=['Production']
            )
            if latest:
                run_id = latest[0].run_id
                self.model = mlflow.xgboost.load_model(f'runs:/{run_id}/model')
                self.model_version = f'v{latest[0].version}'
            else:
                self._load_fallback()
        except Exception:
            self._load_fallback()
        self.explainer = shap.TreeExplainer(self.model)

    def _load_fallback(self):
        model_path = Path(settings.model_dir) / 'housekeeping_workload.ubj'
        if model_path.exists():
            self.model = xgb.XGBRegressor()
            self.model.load_model(str(model_path))
        else:
            import pandas as pd

            self.model = xgb.XGBRegressor(
                n_estimators=100, max_depth=5, learning_rate=0.1
            )
            np.random.seed(42)
            n = 1000
            X = pd.DataFrame({col: np.random.randn(n) for col in FEATURE_COLS})
            y = (
                25
                + 5 * X['occupancy_rate']
                + 2 * X['checkouts_today']
                + np.random.randn(n) * 3
            )
            self.model.fit(X, y)
        self.model_version = 'fallback-v1'

    def predict(self, features: HousekeepingFeatures) -> HousekeepingPrediction:
        import pandas as pd

        X = pd.DataFrame(
            [[getattr(features, col) for col in FEATURE_COLS]], columns=FEATURE_COLS
        )
        pred = float(self.model.predict(X)[0])
        ci_low = pred * 0.85
        ci_high = pred * 1.15
        shap_vals = self.explainer.shap_values(X)[0]
        shap_dict = dict(zip(FEATURE_COLS, [float(v) for v in shap_vals]))
        return HousekeepingPrediction(
            predicted_minutes_per_room=round(pred, 2),
            confidence_interval_low=round(ci_low, 2),
            confidence_interval_high=round(ci_high, 2),
            shap_values=shap_dict,
            model_version=self.model_version,
        )
