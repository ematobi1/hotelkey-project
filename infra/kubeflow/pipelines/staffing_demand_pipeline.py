from kfp import dsl
from kfp.dsl import Dataset, Input, Output, Model, Metrics


ROLES = ['housekeeping', 'front_desk', 'maintenance', 'food_beverage']


@dsl.component(
    base_image='python:3.11',
    packages_to_install=['feast==0.38.0', 'pandas', 'pyarrow'],
)
def extract_features(output_dataset: Output[Dataset], feast_endpoint: str, tenant_ids: str):
    import json
    import pandas as pd
    import feast

    store = feast.FeatureStore(repo_path='/feast/repo')
    tenant_id_list = json.loads(tenant_ids)
    entity_df = pd.DataFrame({
        'tenant_id': tenant_id_list,
        'event_timestamp': [pd.Timestamp.now(tz='UTC')] * len(tenant_id_list),
    })
    features = store.get_historical_features(
        entity_df=entity_df,
        features=[
            'occupancy_features:avg_occupancy_7d',
            'occupancy_features:avg_occupancy_30d',
            'occupancy_features:day_of_week',
            'occupancy_features:month',
            'housekeeping_features:occupancy_rate',
            'housekeeping_features:checkouts_today',
        ],
    ).to_df()
    features.to_parquet(output_dataset.path, index=False)
    print(f"Extracted {len(features)} rows for staffing demand")


@dsl.component(
    base_image='python:3.11',
    packages_to_install=['xgboost==2.0.3', 'scikit-learn', 'pandas', 'mlflow==2.12.2', 'pyarrow'],
)
def train_model(
    input_dataset: Input[Dataset],
    output_model: Output[Model],
    output_metrics: Output[Metrics],
    mlflow_uri: str,
    target_rmse: float,
):
    import json
    import mlflow
    import mlflow.xgboost
    import pandas as pd
    import xgboost as xgb
    from sklearn.metrics import mean_squared_error
    from sklearn.model_selection import train_test_split
    import numpy as np

    df = pd.read_parquet(input_dataset.path)

    feature_cols = [
        'avg_occupancy_7d',
        'avg_occupancy_30d',
        'day_of_week',
        'month',
        'occupancy_rate',
        'checkouts_today',
    ]
    X = df[feature_cols].fillna(0)

    roles = ['housekeeping', 'front_desk', 'maintenance', 'food_beverage']
    role_models = {}
    role_metrics = {}

    mlflow.set_tracking_uri(mlflow_uri)
    exp = mlflow.get_experiment_by_name('hotel-key/staffing-demand-forecast')

    with mlflow.start_run(experiment_id=exp.experiment_id, run_name='all-roles'):
        for role in roles:
            target_col = f'required_staff_{role}'
            if target_col not in df.columns:
                print(f"Warning: target column {target_col} not found, skipping {role}")
                continue

            y = df[target_col].fillna(0)
            X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

            model = xgb.XGBRegressor(
                n_estimators=200,
                max_depth=5,
                learning_rate=0.05,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
            )
            model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

            preds = model.predict(X_val)
            rmse = float(np.sqrt(mean_squared_error(y_val, preds)))
            role_metrics[role] = rmse

            mlflow.log_metric(f'rmse_{role}', rmse)
            role_models[role] = model

            if rmse <= target_rmse:
                mlflow.xgboost.log_model(
                    model,
                    f'model_{role}',
                    registered_model_name=f'staffing-demand-forecast-{role}',
                )
                print(f"Registered {role} model: RMSE={rmse:.2f} (target≤{target_rmse})")
            else:
                print(f"Not promoting {role} model: RMSE={rmse:.2f} > target={target_rmse}")

        mlflow.log_dict(role_metrics, 'role_rmse_summary.json')

        for role, rmse in role_metrics.items():
            output_metrics.log_metric(f'rmse_{role}', rmse)

    if role_models:
        import pickle
        first_role = next(iter(role_models))
        role_models[first_role].save_model(output_model.path)


@dsl.pipeline(
    name='staffing-demand-training',
    description='Train per-role staffing demand XGBoost regressors',
)
def staffing_demand_pipeline(
    feast_endpoint: str = 'http://feast:6566',
    mlflow_uri: str = 'http://mlflow:5000',
    tenant_ids: str = '[]',
    target_rmse: float = 1.0,
):
    extract = extract_features(feast_endpoint=feast_endpoint, tenant_ids=tenant_ids)
    train_model(
        input_dataset=extract.outputs['output_dataset'],
        mlflow_uri=mlflow_uri,
        target_rmse=target_rmse,
    )


if __name__ == '__main__':
    from kfp import compiler
    compiler.Compiler().compile(staffing_demand_pipeline, 'staffing_demand_pipeline.yaml')
