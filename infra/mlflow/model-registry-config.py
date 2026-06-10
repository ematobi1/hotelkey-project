import mlflow
from mlflow.tracking import MlflowClient

MLFLOW_URI = "http://localhost:5000"
mlflow.set_tracking_uri(MLFLOW_URI)
client = MlflowClient()

MODELS = [
    ("housekeeping-workload-forecast", "XGBoost regressor for housekeeping task workload"),
    ("maintenance-failure-predictor", "XGBoost survival model for equipment failure prediction"),
    ("staffing-demand-forecast", "XGBoost staffing demand by role and shift"),
    ("occupancy-forecast", "Gradient boosting occupancy forecast at 30-day horizon"),
]

for name, description in MODELS:
    exp_name = f"hotel-key/{name}"
    if not mlflow.get_experiment_by_name(exp_name):
        mlflow.create_experiment(exp_name, tags={"team": "ml", "project": "hotel-key"})
        print(f"Created experiment: {exp_name}")
    else:
        print(f"Experiment already exists: {exp_name}")

    try:
        client.create_registered_model(name, description=description, tags={"project": "hotel-key"})
        print(f"Created model: {name}")
    except Exception:
        print(f"Model already exists: {name}")
