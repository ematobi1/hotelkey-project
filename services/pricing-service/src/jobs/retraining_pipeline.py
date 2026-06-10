"""
Weekly retraining pipeline — runs every Sunday at 02:00 UTC.
Uses last 90 days of actuals from the data warehouse.
"""
import os
import subprocess
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd
import structlog

from ..config import settings

logger = structlog.get_logger()


async def fetch_training_data(tenant_id: str, lookback_days: int = 90) -> pd.DataFrame:
    """
    Fetch historical actuals from ClickHouse for retraining.
    Falls back to synthetic data if ClickHouse is unavailable.
    """
    try:
        import clickhouse_driver
        ch = clickhouse_driver.Client(host=os.environ.get('CLICKHOUSE_HOST', 'localhost'))
        start = date.today() - timedelta(days=lookback_days)
        rows = ch.execute(
            """
            SELECT
                toDate(snapshot_time) AS date,
                avg(occupancy_rate) AS occupancy_rate,
                avg(adr) AS current_rate,
                avg(revpar) AS revpar
            FROM hotel_key_analytics.occupancy_snapshots
            WHERE tenant_id = %(tenant_id)s AND snapshot_time >= %(start)s
            GROUP BY date
            ORDER BY date
            """,
            {'tenant_id': tenant_id, 'start': str(start)},
        )
        if rows:
            df = pd.DataFrame(rows, columns=['date', 'occupancy_rate', 'current_rate', 'revpar'])
            df['day_of_week'] = pd.to_datetime(df['date']).dt.dayofweek
            df['days_ahead'] = 7
            df['competitor_rate_ratio'] = 1.0
            df['demand_index'] = df['occupancy_rate']
            return df
    except Exception as e:
        logger.warning("clickhouse_unavailable", error=str(e))

    np.random.seed(42)
    n = lookback_days
    dates = pd.date_range(end=date.today(), periods=n, freq='D')
    return pd.DataFrame({
        'date': dates,
        'occupancy_rate': np.clip(0.65 + np.random.randn(n) * 0.1, 0.1, 0.99),
        'current_rate': 150 + np.random.randn(n) * 20,
        'revpar': 100 + np.random.randn(n) * 15,
        'day_of_week': [d.weekday() for d in dates],
        'days_ahead': np.random.randint(0, 30, n),
        'competitor_rate_ratio': 0.95 + np.random.randn(n) * 0.05,
        'demand_index': np.clip(0.5 + np.random.randn(n) * 0.2, 0, 1),
    })


async def run_retraining(tenant_id: str) -> None:
    """Run full retraining pipeline for one hotel."""
    logger.info("retraining_started", tenant_id=tenant_id)
    await fetch_training_data(tenant_id, settings.retraining_lookback_days)

    result = subprocess.run(
        [
            sys.executable, '-m', 'src.models.training.train_ppo',
            '--hotel-id', tenant_id,
            '--iterations', '50',
        ],
        capture_output=True,
        text=True,
        timeout=3600,
    )

    if result.returncode != 0:
        logger.error("retraining_failed", tenant_id=tenant_id, stderr=result.stderr)
        return

    logger.info("retraining_complete", tenant_id=tenant_id)


def schedule_weekly_retraining(tenant_ids: list[str]) -> None:
    """
    Register a weekly Sunday 02:00 UTC retraining job in the APScheduler instance.
    Must be called after start_scheduler().
    """
    import asyncio
    from ..jobs.signal_polling_job import scheduler
    from apscheduler.triggers.cron import CronTrigger

    async def _retrain_all() -> None:
        for tid in tenant_ids:
            await run_retraining(tid)

    scheduler.add_job(
        lambda: asyncio.ensure_future(_retrain_all()),
        trigger=CronTrigger(day_of_week='sun', hour=2, minute=0, timezone='UTC'),
        id='weekly_retraining',
        replace_existing=True,
    )
