from kfp import dsl
from kfp.dsl import Dataset, Input, Output, Model, Metrics


@dsl.component(
    base_image='python:3.11',
    packages_to_install=['xgboost==2.0.3', 'feast==0.38.0', 'mlflow==2.12.2', 'pandas', 'scikit-learn', 'shap', 'pyarrow'],
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
            'housekeeping_features:avg_task_duration_min',
            'housekeeping_features:tasks_per_hour_7d_avg',
            'housekeeping_features:occupancy_rate',
            'housekeeping_features:checkouts_today',
            'housekeeping_features:hour_of_day',
            'housekeeping_features:day_of_week',
        ],
    ).to_df()
    features.to_parquet(output_dataset.path, index=False)
    print(f"Extracted {len(features)} rows for {len(tenant_id_list)} tenants")


@dsl.component(
    base_image='python:3.11',
    packages_to_install=['xgboost==2.0.3', 'scikit-learn', 'pandas', 'shap', 'mlflow==2.12.2', 'pyarrow'],
)
def train_model(
    input_dataset: Input[Dataset],
    output_model: Output[Model],
    output_metrics: Output[Metrics],
    mlflow_uri: str,
    target_mae_minutes: float,
):
    import json
    import mlflow
    import mlflow.xgboost
    import pandas as pd
    import shap
    import xgboost as xgb
    from sklearn.metrics import mean_absolute_error
    from sklearn.model_selection import train_test_split

    df = pd.read_parquet(input_dataset.path)
    feature_cols = [
        'avg_task_duration_min',
        'tasks_per_hour_7d_avg',
        'occupancy_rate',
        'checkouts_today',
        'hour_of_day',
        'day_of_week',
    ]
    X = df[feature_cols].fillna(0)
    y = df['avg_task_duration_min']

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    mlflow.set_tracking_uri(mlflow_uri)
    exp = mlflow.get_experiment_by_name('hotel-key/housekeeping-workload-forecast')
    with mlflow.start_run(experiment_id=exp.experiment_id):
        model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
        )
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

        preds = model.predict(X_val)
        mae = float(mean_absolute_error(y_val, preds))

        mlflow.log_metric('mae_minutes', mae)
        mlflow.log_param('target_mae', target_mae_minutes)
        mlflow.log_param('n_estimators', 200)
        mlflow.log_param('max_depth', 6)

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_val.iloc[:100])
        feature_importance = dict(zip(feature_cols, abs(shap_values).mean(0).tolist()))
        mlflow.log_dict(feature_importance, 'shap_feature_importance.json')

        if mae < target_mae_minutes:
            mlflow.xgboost.log_model(
                model,
                'model',
                registered_model_name='housekeeping-workload-forecast',
            )
            print(f"Model registered: MAE={mae:.2f} min (target={target_mae_minutes})")
        else:
            print(f"Model not promoted: MAE={mae:.2f} > target={target_mae_minutes}")

        output_metrics.log_metric('mae_minutes', mae)

    model.save_model(output_model.path)


@dsl.pipeline(
    name='housekeeping-workload-training',
    description='Train and register housekeeping workload forecast model',
)
def housekeeping_workload_pipeline(
    feast_endpoint: str = 'http://feast:6566',
    mlflow_uri: str = 'http://mlflow:5000',
    tenant_ids: str = '[]',
    target_mae_minutes: float = 8.0,
):
    extract = extract_features(feast_endpoint=feast_endpoint, tenant_ids=tenant_ids)
    train_model(
        input_dataset=extract.outputs['output_dataset'],
        mlflow_uri=mlflow_uri,
        target_mae_minutes=target_mae_minutes,
    )


if __name__ == '__main__':
    from kfp import compiler
    compiler.Compiler().compile(housekeeping_workload_pipeline, 'housekeeping_workload_pipeline.yaml')
