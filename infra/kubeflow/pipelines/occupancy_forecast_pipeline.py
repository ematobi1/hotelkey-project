from kfp import dsl
from kfp.dsl import Dataset, Input, Output, Model, Metrics


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
            'occupancy_features:avg_adr_7d',
            'occupancy_features:avg_revpar_30d',
            'occupancy_features:day_of_week',
            'occupancy_features:month',
            'occupancy_features:lead_time_days_avg',
        ],
    ).to_df()
    features.to_parquet(output_dataset.path, index=False)
    print(f"Extracted {len(features)} rows for occupancy forecast")


@dsl.component(
    base_image='python:3.11',
    packages_to_install=[
        'xgboost==2.0.3',
        'scikit-learn',
        'pandas',
        'numpy',
        'mlflow==2.12.2',
        'pyarrow',
    ],
)
def train_model(
    input_dataset: Input[Dataset],
    output_model: Output[Model],
    output_metrics: Output[Metrics],
    mlflow_uri: str,
    target_mape: float,
):
    import mlflow
    import mlflow.xgboost
    import numpy as np
    import pandas as pd
    import xgboost as xgb
    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.metrics import mean_absolute_percentage_error
    from sklearn.model_selection import train_test_split

    df = pd.read_parquet(input_dataset.path)

    feature_cols = [
        'avg_occupancy_7d',
        'avg_occupancy_30d',
        'avg_adr_7d',
        'avg_revpar_30d',
        'day_of_week',
        'month',
        'lead_time_days_avg',
    ]
    X = df[feature_cols].fillna(0)
    y = df['occupancy_rate_30d_ahead'].fillna(0)

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

    mlflow.set_tracking_uri(mlflow_uri)
    exp = mlflow.get_experiment_by_name('hotel-key/occupancy-forecast')

    with mlflow.start_run(experiment_id=exp.experiment_id):
        xgb_model = xgb.XGBRegressor(
            n_estimators=300,
            max_depth=6,
            learning_rate=0.04,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
        )
        xgb_model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

        gbr_model = GradientBoostingRegressor(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            random_state=42,
        )
        gbr_model.fit(X_train, y_train)

        xgb_preds = xgb_model.predict(X_val)
        gbr_preds = gbr_model.predict(X_val)
        ensemble_preds = 0.6 * xgb_preds + 0.4 * gbr_preds

        safe_y_val = np.where(y_val == 0, 1e-6, y_val)
        mape = float(mean_absolute_percentage_error(safe_y_val, ensemble_preds)) * 100

        mlflow.log_metric('mape_pct', mape)
        mlflow.log_param('target_mape', target_mape)
        mlflow.log_param('xgb_weight', 0.6)
        mlflow.log_param('gbr_weight', 0.4)

        if mape < target_mape:
            mlflow.xgboost.log_model(
                xgb_model,
                'xgb_model',
                registered_model_name='occupancy-forecast',
            )
            print(f"Ensemble registered: MAPE={mape:.2f}% (target<{target_mape}%)")
        else:
            print(f"Model not promoted: MAPE={mape:.2f}% >= target={target_mape}%")

        output_metrics.log_metric('mape_pct', mape)

    xgb_model.save_model(output_model.path)


@dsl.pipeline(
    name='occupancy-forecast-training',
    description='Train XGBoost + GBR ensemble for 30-day occupancy forecasting',
)
def occupancy_forecast_pipeline(
    feast_endpoint: str = 'http://feast:6566',
    mlflow_uri: str = 'http://mlflow:5000',
    tenant_ids: str = '[]',
    target_mape: float = 8.0,
):
    extract = extract_features(feast_endpoint=feast_endpoint, tenant_ids=tenant_ids)
    train_model(
        input_dataset=extract.outputs['output_dataset'],
        mlflow_uri=mlflow_uri,
        target_mape=target_mape,
    )


if __name__ == '__main__':
    from kfp import compiler
    compiler.Compiler().compile(occupancy_forecast_pipeline, 'occupancy_forecast_pipeline.yaml')
