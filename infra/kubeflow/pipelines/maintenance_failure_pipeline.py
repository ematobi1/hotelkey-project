from kfp import dsl
from kfp.dsl import Dataset, Input, Output, Model, Metrics


@dsl.component(
    base_image='python:3.11',
    packages_to_install=['feast==0.38.0', 'pandas', 'pyarrow'],
)
def extract_features(output_dataset: Output[Dataset], feast_endpoint: str, room_ids: str):
    import json
    import pandas as pd
    import feast

    store = feast.FeatureStore(repo_path='/feast/repo')
    room_id_list = json.loads(room_ids)
    entity_df = pd.DataFrame({
        'room_id': room_id_list,
        'event_timestamp': [pd.Timestamp.now(tz='UTC')] * len(room_id_list),
    })
    features = store.get_historical_features(
        entity_df=entity_df,
        features=[
            'maintenance_features:days_since_last_maintenance',
            'maintenance_features:failure_count_90d',
            'maintenance_features:equipment_age_days',
            'maintenance_features:category',
            'maintenance_features:emergency_count_30d',
        ],
    ).to_df()
    features.to_parquet(output_dataset.path, index=False)
    print(f"Extracted {len(features)} rows for {len(room_id_list)} rooms")


@dsl.component(
    base_image='python:3.11',
    packages_to_install=['xgboost==2.0.3', 'scikit-learn', 'pandas', 'shap', 'mlflow==2.12.2', 'pyarrow'],
)
def train_model(
    input_dataset: Input[Dataset],
    output_model: Output[Model],
    output_metrics: Output[Metrics],
    mlflow_uri: str,
    target_precision: float,
    threshold: float,
):
    import json
    import mlflow
    import mlflow.xgboost
    import numpy as np
    import pandas as pd
    import shap
    import xgboost as xgb
    from sklearn.metrics import precision_score, recall_score, roc_auc_score
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import LabelEncoder

    df = pd.read_parquet(input_dataset.path)

    le = LabelEncoder()
    df['category_encoded'] = le.fit_transform(df['category'].fillna('unknown'))

    feature_cols = [
        'days_since_last_maintenance',
        'failure_count_90d',
        'equipment_age_days',
        'category_encoded',
        'emergency_count_30d',
    ]
    X = df[feature_cols].fillna(0)
    y = df['failure_within_7_days'].astype(int)

    pos_count = y.sum()
    neg_count = len(y) - pos_count
    scale_pos_weight = neg_count / max(pos_count, 1)

    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    mlflow.set_tracking_uri(mlflow_uri)
    exp = mlflow.get_experiment_by_name('hotel-key/maintenance-failure-predictor')
    with mlflow.start_run(experiment_id=exp.experiment_id):
        model = xgb.XGBClassifier(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=scale_pos_weight,
            use_label_encoder=False,
            eval_metric='logloss',
            random_state=42,
        )
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

        proba = model.predict_proba(X_val)[:, 1]
        preds = (proba >= threshold).astype(int)

        precision = float(precision_score(y_val, preds, zero_division=0))
        recall = float(recall_score(y_val, preds, zero_division=0))
        auc = float(roc_auc_score(y_val, proba))

        mlflow.log_metric('precision', precision)
        mlflow.log_metric('recall', recall)
        mlflow.log_metric('roc_auc', auc)
        mlflow.log_param('threshold', threshold)
        mlflow.log_param('target_precision', target_precision)
        mlflow.log_param('scale_pos_weight', scale_pos_weight)

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_val.iloc[:100])
        feature_importance = dict(zip(feature_cols, abs(shap_values).mean(0).tolist()))
        mlflow.log_dict(feature_importance, 'shap_feature_importance.json')

        if precision >= target_precision:
            mlflow.xgboost.log_model(
                model,
                'model',
                registered_model_name='maintenance-failure-predictor',
            )
            print(f"Model registered: precision={precision:.3f} (target={target_precision})")
        else:
            print(f"Model not promoted: precision={precision:.3f} < target={target_precision}")

        output_metrics.log_metric('precision', precision)
        output_metrics.log_metric('recall', recall)
        output_metrics.log_metric('roc_auc', auc)

    model.save_model(output_model.path)


@dsl.pipeline(
    name='maintenance-failure-prediction-training',
    description='Train and register equipment failure prediction classifier',
)
def maintenance_failure_pipeline(
    feast_endpoint: str = 'http://feast:6566',
    mlflow_uri: str = 'http://mlflow:5000',
    room_ids: str = '[]',
    target_precision: float = 0.75,
    threshold: float = 0.35,
):
    extract = extract_features(feast_endpoint=feast_endpoint, room_ids=room_ids)
    train_model(
        input_dataset=extract.outputs['output_dataset'],
        mlflow_uri=mlflow_uri,
        target_precision=target_precision,
        threshold=threshold,
    )


if __name__ == '__main__':
    from kfp import compiler
    compiler.Compiler().compile(maintenance_failure_pipeline, 'maintenance_failure_pipeline.yaml')
