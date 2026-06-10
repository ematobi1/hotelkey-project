"""
Train all four Hotel Key ML models on synthetic data and save to ./models/.
Run from the ml-service root: python -m src.training.train_all
"""
import os
import numpy as np
import pandas as pd
import xgboost as xgb
import mlflow
from pathlib import Path
from sklearn.metrics import (
    mean_absolute_error,
    precision_score,
    mean_absolute_percentage_error,
)
from sklearn.model_selection import train_test_split

MODELS_DIR = Path('./models')
MODELS_DIR.mkdir(exist_ok=True)

MLFLOW_URI = os.environ.get('MLFLOW_URI', 'http://localhost:5000')
mlflow.set_tracking_uri(MLFLOW_URI)

HK_FEATURE_COLS = [
    'hour_of_day',
    'day_of_week',
    'occupancy_rate',
    'checkouts_today',
    'avg_task_duration_7d',
    'tasks_in_progress',
    'staff_on_duty',
]

MAINT_FEATURE_COLS = [
    'days_since_last_maintenance',
    'failure_count_90d',
    'equipment_age_days',
    'emergency_count_30d',
    'last_failure_severity',
]

STAFF_FEATURE_COLS = [
    'day_of_week',
    'hour',
    'occupancy_rate',
    'expected_checkins',
    'expected_checkouts',
    'avg_guests_per_room',
]
ROLES = ['housekeeping', 'front_desk', 'maintenance', 'food_beverage']
ROLE_BASELINES = {'housekeeping': 8, 'front_desk': 3, 'maintenance': 2, 'food_beverage': 5}

OCC_FEATURE_COLS = [
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


def train_housekeeping_workload():
    print('Training housekeeping workload model...')
    np.random.seed(0)
    n = 8000
    df = pd.DataFrame({
        'hour_of_day': np.random.randint(6, 22, n),
        'day_of_week': np.random.randint(0, 7, n),
        'occupancy_rate': np.random.uniform(0.3, 1.0, n),
        'checkouts_today': np.random.randint(0, 50, n),
        'avg_task_duration_7d': np.random.uniform(20, 45, n),
        'tasks_in_progress': np.random.randint(0, 20, n),
        'staff_on_duty': np.random.randint(2, 15, n),
    })
    y = (
        28
        + 8 * df['occupancy_rate']
        + 0.15 * df['checkouts_today']
        - 0.5 * df['staff_on_duty']
        + 0.3 * df['tasks_in_progress']
        + np.random.randn(n) * 3.5
    )
    y = np.clip(y, 10, 60)

    X_train, X_test, y_train, y_test = train_test_split(df, y, test_size=0.2, random_state=42)
    model = xgb.XGBRegressor(
        n_estimators=300,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    mae = mean_absolute_error(y_test, model.predict(X_test))
    print(f'  MAE: {mae:.2f} min/room (target: < 8)')

    with mlflow.start_run(run_name='housekeeping-workload-forecast'):
        mlflow.log_metric('mae', mae)
        mlflow.log_param('n_estimators', 300)
        mlflow.xgboost.log_model(model, 'model')

    model_path = MODELS_DIR / 'housekeeping_workload.ubj'
    model.save_model(str(model_path))
    print(f'  Saved to {model_path}')
    return mae


def train_maintenance_failure():
    print('Training maintenance failure model...')
    np.random.seed(1)
    n = 10000
    days = np.random.uniform(0, 365, n)
    failures = np.random.randint(0, 10, n)
    age = np.random.randint(0, 3650, n)
    emergency = np.random.randint(0, 5, n)
    severity = np.random.randint(1, 4, n)
    df = pd.DataFrame({
        'days_since_last_maintenance': days,
        'failure_count_90d': failures,
        'equipment_age_days': age,
        'emergency_count_30d': emergency,
        'last_failure_severity': severity,
    })
    failure_score = (
        0.01 * days
        + 0.2 * failures
        + 0.0005 * age
        + 0.3 * emergency
        + 0.15 * severity
    )
    prob_true = 1 / (1 + np.exp(-0.8 * (failure_score - 2.5)))
    y = (np.random.uniform(0, 1, n) < prob_true).astype(int)

    X_train, X_test, y_train, y_test = train_test_split(df, y, test_size=0.2, random_state=42)
    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=5,
        scale_pos_weight=(y_train == 0).sum() / max((y_train == 1).sum(), 1),
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
        eval_metric='logloss',
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.35).astype(int)
    precision = precision_score(y_test, y_pred, zero_division=0)
    print(f'  Precision@0.35: {precision:.3f} (target: > 0.75)')

    with mlflow.start_run(run_name='maintenance-failure-predictor'):
        mlflow.log_metric('precision_at_0.35', precision)
        mlflow.log_param('n_estimators', 300)
        mlflow.xgboost.log_model(model, 'model')

    model_path = MODELS_DIR / 'maintenance_failure.ubj'
    model.save_model(str(model_path))
    print(f'  Saved to {model_path}')
    return precision


def train_staffing_demand():
    print('Training staffing demand models...')
    np.random.seed(2)
    n = 6000
    df = pd.DataFrame({
        'day_of_week': np.random.randint(0, 7, n),
        'hour': np.random.randint(0, 24, n),
        'occupancy_rate': np.random.uniform(0.3, 1.0, n),
        'expected_checkins': np.random.randint(0, 30, n),
        'expected_checkouts': np.random.randint(0, 30, n),
        'avg_guests_per_room': np.random.uniform(1.0, 3.0, n),
    })
    errors = {}
    for role in ROLES:
        base = ROLE_BASELINES[role]
        y = (
            base
            + (df['occupancy_rate'] * 3).round()
            + (df['expected_checkins'] * 0.1).round()
            + (df['expected_checkouts'] * 0.08).round()
            + np.random.randint(-1, 2, n)
        ).clip(1, base * 3)

        X_train, X_test, y_train, y_test = train_test_split(df, y, test_size=0.2, random_state=42)
        model = xgb.XGBRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            random_state=42,
        )
        model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        preds = model.predict(X_test)
        within_one = np.mean(np.abs(preds - y_test) <= 1)
        errors[role] = within_one
        print(f'  {role}: within ±1 staff = {within_one:.1%} (target: high)')

        with mlflow.start_run(run_name=f'staffing-demand-{role}'):
            mlflow.log_metric('within_1_staff', within_one)
            mlflow.xgboost.log_model(model, 'model')

        model_path = MODELS_DIR / f'staffing_demand_{role}.ubj'
        model.save_model(str(model_path))
        print(f'  Saved to {model_path}')
    return errors


def train_occupancy_forecast():
    print('Training occupancy forecast model...')
    np.random.seed(3)
    n = 12000
    dow = np.random.randint(0, 7, n)
    month = np.random.randint(1, 13, n)
    days_ahead = np.random.randint(1, 31, n)
    df = pd.DataFrame({
        'day_of_week': dow,
        'month': month,
        'days_ahead': days_ahead,
        'avg_occupancy_7d': np.random.uniform(0.4, 0.95, n),
        'avg_occupancy_30d': np.random.uniform(0.4, 0.95, n),
        'booking_pace_7d': np.random.uniform(0, 20, n),
        'avg_lead_time_days': np.random.uniform(5, 60, n),
        'local_events_flag': np.random.randint(0, 2, n),
        'avg_adr_30d': np.random.uniform(80, 300, n),
    })
    weekend_bump = np.where(dow >= 5, 0.08, 0.0)
    summer_bump = np.where((month >= 6) & (month <= 8), 0.06, 0.0)
    event_bump = df['local_events_flag'].values * 0.07
    y = (
        0.65
        + 0.15 * df['avg_occupancy_7d']
        + 0.10 * df['avg_occupancy_30d']
        + 0.004 * df['booking_pace_7d']
        + weekend_bump
        + summer_bump
        + event_bump
        + np.random.randn(n) * 0.04
    )
    y = np.clip(y, 0.1, 1.0)

    X_train, X_test, y_train, y_test = train_test_split(df, y, test_size=0.2, random_state=42)
    model = xgb.XGBRegressor(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.03,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    preds = np.clip(model.predict(X_test), 0.01, 1.0)
    mape = mean_absolute_percentage_error(y_test, preds) * 100
    print(f'  MAPE: {mape:.2f}% (target: < 8%)')

    with mlflow.start_run(run_name='occupancy-forecast'):
        mlflow.log_metric('mape', mape)
        mlflow.log_param('n_estimators', 400)
        mlflow.xgboost.log_model(model, 'model')

    model_path = MODELS_DIR / 'occupancy_forecast.ubj'
    model.save_model(str(model_path))
    print(f'  Saved to {model_path}')
    return mape


if __name__ == '__main__':
    print('=== Hotel Key ML — Training all models ===\n')
    hk_mae = train_housekeeping_workload()
    maint_precision = train_maintenance_failure()
    staff_errors = train_staffing_demand()
    occ_mape = train_occupancy_forecast()

    print('\n=== Summary ===')
    print(f'Housekeeping MAE:         {hk_mae:.2f} min/room  (target < 8)')
    print(f'Maintenance Precision:    {maint_precision:.3f}         (target > 0.75)')
    for role, acc in staff_errors.items():
        print(f'Staffing {role:<16} ±1 accuracy: {acc:.1%}')
    print(f'Occupancy MAPE:           {occ_mape:.2f}%          (target < 8%)')
    print('\nAll models saved to ./models/')
