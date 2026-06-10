"""
Backfill historical Phase 1/2 pilot hotel data into ClickHouse for ML training.
Reads from PostgreSQL (reservation, housekeeping, maintenance, billing tables).
Writes to ClickHouse analytics tables.
"""
import asyncio
import os
from datetime import datetime, timedelta

import asyncpg
import clickhouse_driver

POSTGRES_DSN = os.environ['DATABASE_URL']
CLICKHOUSE_HOST = os.environ.get('CLICKHOUSE_HOST', 'localhost')
CLICKHOUSE_PORT = int(os.environ.get('CLICKHOUSE_PORT', '9000'))
CLICKHOUSE_USER = os.environ.get('CLICKHOUSE_USER', 'hotelkey')
CLICKHOUSE_PASSWORD = os.environ.get('CLICKHOUSE_PASSWORD', 'hotelkey_dev')
CLICKHOUSE_DB = os.environ.get('CLICKHOUSE_DB', 'hotel_key_analytics')


async def backfill_reservations(
    pg_conn: asyncpg.Connection,
    ch_client: clickhouse_driver.Client,
    start_date: datetime,
    end_date: datetime,
) -> None:
    rows = await pg_conn.fetch(
        """
        SELECT
            r.created_at                                          AS event_time,
            r.tenant_id,
            r.id                                                  AS reservation_id,
            r.room_id,
            COALESCE(rt.name, 'unknown')                         AS room_type,
            r.check_in_date,
            r.check_out_date,
            COALESCE(r.adults, 1)                                AS adults,
            COALESCE(r.children, 0)                              AS children,
            COALESCE(r.total_amount, 0)                          AS total_amount,
            'USD'                                                 AS currency_code,
            r.status,
            'direct'                                              AS channel,
            GREATEST(0, EXTRACT(DAY FROM r.check_in_date - r.created_at::date)::int)
                                                                  AS lead_time_days,
            GREATEST(0, (r.check_out_date - r.check_in_date)::int)
                                                                  AS length_of_stay,
            r.created_at
        FROM reservation r
        LEFT JOIN room rm ON rm.id = r.room_id
        LEFT JOIN room_type rt ON rt.id = rm.room_type_id
        WHERE r.created_at BETWEEN $1 AND $2
        ORDER BY r.created_at
        """,
        start_date,
        end_date,
    )

    if rows:
        ch_client.execute(
            f'INSERT INTO {CLICKHOUSE_DB}.reservation_events VALUES',
            [dict(r) for r in rows],
        )
        print(f"  Backfilled {len(rows)} reservation events")


async def backfill_housekeeping(
    pg_conn: asyncpg.Connection,
    ch_client: clickhouse_driver.Client,
    start_date: datetime,
    end_date: datetime,
) -> None:
    rows = await pg_conn.fetch(
        """
        SELECT
            created_at                                    AS event_time,
            tenant_id,
            id                                            AS task_id,
            room_id,
            task_type,
            COALESCE(priority, 3)                        AS priority,
            assigned_to,
            started_at,
            completed_at,
            CASE
                WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0
            END                                           AS duration_minutes
        FROM housekeeping_task
        WHERE created_at BETWEEN $1 AND $2
        ORDER BY created_at
        """,
        start_date,
        end_date,
    )

    if rows:
        ch_client.execute(
            f'INSERT INTO {CLICKHOUSE_DB}.housekeeping_events VALUES',
            [dict(r) for r in rows],
        )
        print(f"  Backfilled {len(rows)} housekeeping events")


async def backfill_maintenance(
    pg_conn: asyncpg.Connection,
    ch_client: clickhouse_driver.Client,
    start_date: datetime,
    end_date: datetime,
) -> None:
    rows = await pg_conn.fetch(
        """
        SELECT
            created_at                                            AS event_time,
            tenant_id,
            id                                                    AS work_order_id,
            room_id,
            category,
            COALESCE(priority, 3)                                AS priority,
            COALESCE(equipment_type, 'general')                  AS equipment_type,
            created_at,
            completed_at,
            CASE
                WHEN completed_at IS NOT NULL
                THEN EXTRACT(DAY FROM completed_at - created_at)::float
            END                                                   AS time_to_failure_days,
            COALESCE(is_emergency, false)                        AS was_emergency
        FROM maintenance_work_order
        WHERE created_at BETWEEN $1 AND $2
        ORDER BY created_at
        """,
        start_date,
        end_date,
    )

    if rows:
        ch_client.execute(
            f'INSERT INTO {CLICKHOUSE_DB}.maintenance_events VALUES',
            [dict(r) for r in rows],
        )
        print(f"  Backfilled {len(rows)} maintenance events")


async def backfill_billing(
    pg_conn: asyncpg.Connection,
    ch_client: clickhouse_driver.Client,
    start_date: datetime,
    end_date: datetime,
) -> None:
    rows = await pg_conn.fetch(
        """
        SELECT
            f.created_at                                          AS event_time,
            f.tenant_id,
            f.id                                                  AS folio_id,
            f.reservation_id,
            COALESCE(f.total_amount, 0)                          AS total_amount,
            COALESCE(
                ARRAY(SELECT charge_type FROM folio_line_item fli WHERE fli.folio_id = f.id),
                ARRAY[]::text[]
            )                                                     AS charge_types,
            f.settled_at
        FROM folio f
        WHERE f.created_at BETWEEN $1 AND $2
        ORDER BY f.created_at
        """,
        start_date,
        end_date,
    )

    if rows:
        ch_client.execute(
            f'INSERT INTO {CLICKHOUSE_DB}.billing_events VALUES',
            [dict(r) for r in rows],
        )
        print(f"  Backfilled {len(rows)} billing events")


async def main() -> None:
    pg_conn = await asyncpg.connect(POSTGRES_DSN)
    ch_client = clickhouse_driver.Client(
        host=CLICKHOUSE_HOST,
        port=CLICKHOUSE_PORT,
        user=CLICKHOUSE_USER,
        password=CLICKHOUSE_PASSWORD,
        database=CLICKHOUSE_DB,
    )

    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    chunk_start = start_date

    print(f"Starting backfill: {start_date.date()} → {end_date.date()}")

    while chunk_start < end_date:
        chunk_end = min(chunk_start + timedelta(days=30), end_date)
        print(f"\nChunk: {chunk_start.date()} → {chunk_end.date()}")
        await backfill_reservations(pg_conn, ch_client, chunk_start, chunk_end)
        await backfill_housekeeping(pg_conn, ch_client, chunk_start, chunk_end)
        await backfill_maintenance(pg_conn, ch_client, chunk_start, chunk_end)
        await backfill_billing(pg_conn, ch_client, chunk_start, chunk_end)
        chunk_start = chunk_end

    await pg_conn.close()
    print("\nBackfill complete")


if __name__ == '__main__':
    asyncio.run(main())
