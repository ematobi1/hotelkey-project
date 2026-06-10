CREATE DATABASE IF NOT EXISTS hotel_key_analytics;

-- Reservation events for occupancy/revenue ML features
CREATE TABLE IF NOT EXISTS hotel_key_analytics.reservation_events (
    event_time DateTime,
    tenant_id UUID,
    reservation_id UUID,
    room_id UUID,
    room_type VARCHAR(50),
    check_in_date Date,
    check_out_date Date,
    adults UInt8,
    children UInt8,
    total_amount Decimal(10,2),
    currency_code FixedString(3),
    status LowCardinality(String),
    channel LowCardinality(String),
    lead_time_days UInt16,
    length_of_stay UInt8,
    created_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (tenant_id, event_time, reservation_id);

-- Room occupancy snapshots (hourly)
CREATE TABLE IF NOT EXISTS hotel_key_analytics.occupancy_snapshots (
    snapshot_time DateTime,
    tenant_id UUID,
    total_rooms UInt16,
    occupied_rooms UInt16,
    out_of_service_rooms UInt8,
    occupancy_rate Float32,
    adr Decimal(10,2),
    revpar Decimal(10,2),
    date Date MATERIALIZED toDate(snapshot_time)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(snapshot_time)
ORDER BY (tenant_id, snapshot_time);

-- Housekeeping tasks for workload forecasting
CREATE TABLE IF NOT EXISTS hotel_key_analytics.housekeeping_events (
    event_time DateTime,
    tenant_id UUID,
    task_id UUID,
    room_id UUID,
    task_type LowCardinality(String),
    priority UInt8,
    assigned_to UUID,
    started_at Nullable(DateTime),
    completed_at Nullable(DateTime),
    duration_minutes Nullable(Float32),
    day_of_week UInt8 MATERIALIZED toDayOfWeek(event_time),
    hour_of_day UInt8 MATERIALIZED toHour(event_time)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (tenant_id, event_time, task_id);

-- Maintenance work orders for failure prediction
CREATE TABLE IF NOT EXISTS hotel_key_analytics.maintenance_events (
    event_time DateTime,
    tenant_id UUID,
    work_order_id UUID,
    room_id Nullable(UUID),
    category LowCardinality(String),
    priority UInt8,
    equipment_type LowCardinality(String),
    created_at DateTime,
    completed_at Nullable(DateTime),
    time_to_failure_days Nullable(Float32),
    was_emergency Boolean DEFAULT false
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (tenant_id, event_time, work_order_id);

-- Billing aggregates for RevPAR computation
CREATE TABLE IF NOT EXISTS hotel_key_analytics.billing_events (
    event_time DateTime,
    tenant_id UUID,
    folio_id UUID,
    reservation_id UUID,
    total_amount Decimal(10,2),
    charge_types Array(String),
    settled_at Nullable(DateTime)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (tenant_id, event_time, folio_id);

-- Daily aggregated ML features (materialized view)
CREATE MATERIALIZED VIEW IF NOT EXISTS hotel_key_analytics.daily_hotel_features
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (tenant_id, date)
AS SELECT
    toDate(snapshot_time) AS date,
    tenant_id,
    avg(occupancy_rate) AS avg_occupancy,
    max(occupancy_rate) AS max_occupancy,
    avg(adr) AS avg_adr,
    avg(revpar) AS avg_revpar,
    count() AS snapshot_count
FROM hotel_key_analytics.occupancy_snapshots
GROUP BY tenant_id, date;
