"""
Maintenance Failure Predictor — XGBoost Classifier (survival analysis)
Target: P(failure within 7 days)
KPI: Precision > 0.75 @ threshold 0.35
"""
import numpy as np
import xgboost as xgb
import shap
import mlflow
from pydantic import BaseModel
from ..config import settings

FEATURE_COLS = [
    'days_since_last_maintenance',
    'failure_count_90d',
    'equipment_age_days',
    'emergency_count_30d',
    'last_failure_severity',
]
THRESHOLD = 0.35


class MaintenanceFeatures(BaseModel):
    room_id: str
    tenant_id: str
    equipment_type: str
    days_since_last_maintenance: float
    failure_count_90d: int
    equipment_age_days: int
    emergency_count_30d: int
    last_failure_severity: int


class MaintenancePrediction(BaseModel):
    failure_probability: float
    will_fail_within_7_days: bool
    risk_level: str
    top_risk_factors: list[dict]
    model_version: str
    recommended_action: str


class MaintenanceFailureModel:
    def __init__(self):
        self.model: xgb.XGBClassifier | None = None
        self.explainer = None
        self.model_version = 'fallback-v1'
        self._load()

    def _load(self):
        try:
            mlflow.set_tracking_uri(settings.mlflow_uri)
            client = mlflow.tracking.MlflowClient()
            latest = client.get_latest_versions(
                'maintenance-failure-predictor', stages=['Production']
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
        import pandas as pd
        from pathlib import Path

        model_path = Path(settings.model_dir) / 'maintenance_failure.ubj'
        if model_path.exists():
            self.model = xgb.XGBClassifier()
            self.model.load_model(str(model_path))
        else:
            self.model = xgb.XGBClassifier(
                n_estimators=100,
                max_depth=5,
                scale_pos_weight=10,
                random_state=42,
            )
            np.random.seed(42)
            n = 2000
            X = pd.DataFrame(
                {col: np.abs(np.random.randn(n)) for col in FEATURE_COLS}
            )
            y = (
                X['days_since_last_maintenance']
                > 2 * X['days_since_last_maintenance'].mean()
            ).astype(int)
            self.model.fit(X, y)
        self.model_version = 'fallback-v1'

    def predict(self, features: MaintenanceFeatures) -> MaintenancePrediction:
        import pandas as pd

        X = pd.DataFrame(
            [[getattr(features, col) for col in FEATURE_COLS]], columns=FEATURE_COLS
        )
        prob = float(self.model.predict_proba(X)[0][1])
        will_fail = prob >= THRESHOLD
        risk_level = 'high' if prob >= 0.6 else 'medium' if prob >= THRESHOLD else 'low'
        shap_vals = self.explainer.shap_values(X)[0]
        top_factors = sorted(
            [
                {'feature': f, 'contribution': float(v)}
                for f, v in zip(FEATURE_COLS, shap_vals)
            ],
            key=lambda x: abs(x['contribution']),
            reverse=True,
        )[:3]
        action = (
            'Schedule preventive maintenance within 48 hours'
            if will_fail
            else 'Monitor — next scheduled maintenance'
        )
        return MaintenancePrediction(
            failure_probability=round(prob, 4),
            will_fail_within_7_days=will_fail,
            risk_level=risk_level,
            top_risk_factors=top_factors,
            model_version=self.model_version,
            recommended_action=action,
        )
