"""
Reads Evidently HTML drift reports and fires a notification via notification-service
when drift score exceeds the configured threshold.
"""
import os
import re
import json
import urllib.request
import urllib.error
from pathlib import Path

REPORTS_DIR = os.environ.get('REPORTS_DIR', '/reports')
NOTIFICATION_SERVICE_URL = os.environ.get(
    'NOTIFICATION_SERVICE_URL',
    'http://notification-service:3000',
)
DRIFT_THRESHOLD = float(os.environ.get('DRIFT_THRESHOLD', '0.3'))

REPORT_FILES = {
    'housekeeping-workload-forecast': 'housekeeping_workload_drift.html',
    'maintenance-failure-predictor': 'maintenance_failure_drift.html',
    'staffing-demand-forecast': 'staffing_demand_drift.html',
    'occupancy-forecast': 'occupancy_forecast_drift.html',
}

# Evidently embeds a JSON data blob in the HTML — this pattern extracts the drift share value.
_DRIFT_SHARE_PATTERN = re.compile(
    r'"share_of_drifted_columns"\s*:\s*([\d.]+)',
    re.IGNORECASE,
)


def _parse_drift_share(html_path: Path) -> float:
    try:
        content = html_path.read_text(encoding='utf-8', errors='replace')
        match = _DRIFT_SHARE_PATTERN.search(content)
        if match:
            return float(match.group(1))
    except OSError as err:
        print(f"Could not read {html_path}: {err}")
    return 0.0


def _post_notification(model_name: str, drift_share: float) -> None:
    payload = json.dumps({
        "type": "model_drift_alert",
        "severity": "high",
        "title": f"Data drift detected: {model_name}",
        "body": (
            f"Model '{model_name}' drift share={drift_share:.2%} exceeds threshold "
            f"{DRIFT_THRESHOLD:.2%}. Re-training may be required."
        ),
        "metadata": {
            "model": model_name,
            "drift_share": drift_share,
            "threshold": DRIFT_THRESHOLD,
        },
    }).encode('utf-8')

    req = urllib.request.Request(
        f"{NOTIFICATION_SERVICE_URL}/v1/notifications",
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"Notification sent for {model_name}: HTTP {resp.status}")
    except urllib.error.URLError as err:
        print(f"Failed to send notification for {model_name}: {err}")


def alert_if_drifted(model_name: str, drifted: bool) -> None:
    if not drifted:
        return
    report_file = REPORT_FILES.get(model_name)
    drift_share = 0.0
    if report_file:
        drift_share = _parse_drift_share(Path(REPORTS_DIR) / report_file)
    _post_notification(model_name, drift_share)


def run() -> None:
    reports_path = Path(REPORTS_DIR)
    for model_name, filename in REPORT_FILES.items():
        html_path = reports_path / filename
        if not html_path.exists():
            print(f"Report not found, skipping: {html_path}")
            continue

        drift_share = _parse_drift_share(html_path)
        print(f"{model_name}: drift_share={drift_share:.2%} (threshold={DRIFT_THRESHOLD:.2%})")

        if drift_share > DRIFT_THRESHOLD:
            _post_notification(model_name, drift_share)
        else:
            print(f"  No alert — drift below threshold")


if __name__ == '__main__':
    run()
