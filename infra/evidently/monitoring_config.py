"""
Evidently drift monitoring for all 4 Hotel Key ML models.
Run daily as a Kubernetes CronJob.
"""
import os

import mlflow
import pandas as pd
from evidently.metric_preset import ClassificationPreset, DataDriftPreset, RegressionPreset
from evidently.metrics import DatasetDriftMetric, DatasetMissingValuesSummaryMetric
from evidently.report import Report

MLFLOW_URI = os.environ.get('MLFLOW_URI', 'http://mlflow:5000')
REPORTS_DIR = os.environ.get('REPORTS_DIR', '/reports')


def _drift_score_from_report(report: Report) -> bool:
    metrics_list = report.as_dict().get('metrics', [])
    for metric in metrics_list:
        if metric.get('metric') == 'DatasetDriftMetric':
            return bool(metric.get('result', {}).get('dataset_drift', False))
    return False


def run_housekeeping_monitoring(reference_data: pd.DataFrame, current_data: pd.DataFrame) -> bool:
    report = Report(metrics=[
        DataDriftPreset(),
        RegressionPreset(),
        DatasetMissingValuesSummaryMetric(),
    ])
    report.run(reference_data=reference_data, current_data=current_data)
    report.save_html(f"{REPORTS_DIR}/housekeeping_workload_drift.html")

    drifted = _drift_score_from_report(report)
    mlflow.set_tracking_uri(MLFLOW_URI)
    with mlflow.start_run(run_name="daily-drift-check-housekeeping"):
        mlflow.log_metric('dataset_drifted', int(drifted))
        mlflow.set_tag('model', 'housekeeping-workload-forecast')

    print(f"Housekeeping drift: {drifted}")
    return drifted


def run_maintenance_monitoring(reference_data: pd.DataFrame, current_data: pd.DataFrame) -> bool:
    report = Report(metrics=[
        DataDriftPreset(),
        ClassificationPreset(),
        DatasetMissingValuesSummaryMetric(),
    ])
    report.run(reference_data=reference_data, current_data=current_data)
    report.save_html(f"{REPORTS_DIR}/maintenance_failure_drift.html")

    drifted = _drift_score_from_report(report)
    mlflow.set_tracking_uri(MLFLOW_URI)
    with mlflow.start_run(run_name="daily-drift-check-maintenance"):
        mlflow.log_metric('dataset_drifted', int(drifted))
        mlflow.set_tag('model', 'maintenance-failure-predictor')

    print(f"Maintenance drift: {drifted}")
    return drifted


def run_staffing_monitoring(reference_data: pd.DataFrame, current_data: pd.DataFrame) -> bool:
    report = Report(metrics=[
        DataDriftPreset(),
        RegressionPreset(),
        DatasetMissingValuesSummaryMetric(),
    ])
    report.run(reference_data=reference_data, current_data=current_data)
    report.save_html(f"{REPORTS_DIR}/staffing_demand_drift.html")

    drifted = _drift_score_from_report(report)
    mlflow.set_tracking_uri(MLFLOW_URI)
    with mlflow.start_run(run_name="daily-drift-check-staffing"):
        mlflow.log_metric('dataset_drifted', int(drifted))
        mlflow.set_tag('model', 'staffing-demand-forecast')

    print(f"Staffing drift: {drifted}")
    return drifted


def run_occupancy_monitoring(reference_data: pd.DataFrame, current_data: pd.DataFrame) -> bool:
    report = Report(metrics=[
        DataDriftPreset(),
        RegressionPreset(),
        DatasetMissingValuesSummaryMetric(),
    ])
    report.run(reference_data=reference_data, current_data=current_data)
    report.save_html(f"{REPORTS_DIR}/occupancy_forecast_drift.html")

    drifted = _drift_score_from_report(report)
    mlflow.set_tracking_uri(MLFLOW_URI)
    with mlflow.start_run(run_name="daily-drift-check-occupancy"):
        mlflow.log_metric('dataset_drifted', int(drifted))
        mlflow.set_tag('model', 'occupancy-forecast')

    print(f"Occupancy drift: {drifted}")
    return drifted


if __name__ == '__main__':
    import sys
    print("Evidently drift monitoring run started")

    # In production: load reference data from ClickHouse (training window),
    # current data from last 7 days of inference logs.
    # For this entrypoint we import the alerter to fire on drift.
    try:
        from alerting.drift_alerter import alert_if_drifted
    except ImportError:
        def alert_if_drifted(model_name: str, drifted: bool) -> None:
            if drifted:
                print(f"ALERT: drift detected for {model_name}")

    # Placeholder DataFrames — replace with ClickHouse queries in production.
    empty_ref = pd.DataFrame()
    empty_cur = pd.DataFrame()

    results = {
        'housekeeping-workload-forecast': False,
        'maintenance-failure-predictor': False,
        'staffing-demand-forecast': False,
        'occupancy-forecast': False,
    }

    if not empty_ref.empty:
        results['housekeeping-workload-forecast'] = run_housekeeping_monitoring(empty_ref, empty_cur)
        results['maintenance-failure-predictor'] = run_maintenance_monitoring(empty_ref, empty_cur)
        results['staffing-demand-forecast'] = run_staffing_monitoring(empty_ref, empty_cur)
        results['occupancy-forecast'] = run_occupancy_monitoring(empty_ref, empty_cur)

    for model_name, drifted in results.items():
        alert_if_drifted(model_name, drifted)

    print("Evidently drift monitoring run completed")
    sys.exit(0)
