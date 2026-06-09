from datetime import timedelta

from feast import Entity, FeatureView, Field, FileSource
from feast.types import Float32, Int32, String

hotel = Entity(name="hotel", join_keys=["tenant_id"], description="Hotel tenant")
room = Entity(name="room", join_keys=["room_id"], description="Individual room")

occupancy_source = FileSource(
    path="data/occupancy_features.parquet",
    timestamp_field="event_timestamp",
)

occupancy_features = FeatureView(
    name="occupancy_features",
    entities=[hotel],
    ttl=timedelta(days=90),
    schema=[
        Field(name="avg_occupancy_7d", dtype=Float32),
        Field(name="avg_occupancy_30d", dtype=Float32),
        Field(name="avg_adr_7d", dtype=Float32),
        Field(name="avg_revpar_30d", dtype=Float32),
        Field(name="day_of_week", dtype=Int32),
        Field(name="month", dtype=Int32),
        Field(name="lead_time_days_avg", dtype=Float32),
    ],
    source=occupancy_source,
)

hk_source = FileSource(
    path="data/housekeeping_features.parquet",
    timestamp_field="event_timestamp",
)

housekeeping_features = FeatureView(
    name="housekeeping_features",
    entities=[hotel],
    ttl=timedelta(days=30),
    schema=[
        Field(name="avg_task_duration_min", dtype=Float32),
        Field(name="tasks_per_hour_7d_avg", dtype=Float32),
        Field(name="occupancy_rate", dtype=Float32),
        Field(name="checkouts_today", dtype=Int32),
        Field(name="hour_of_day", dtype=Int32),
        Field(name="day_of_week", dtype=Int32),
    ],
    source=hk_source,
)

maintenance_source = FileSource(
    path="data/maintenance_features.parquet",
    timestamp_field="event_timestamp",
)

maintenance_features = FeatureView(
    name="maintenance_features",
    entities=[room],
    ttl=timedelta(days=365),
    schema=[
        Field(name="days_since_last_maintenance", dtype=Float32),
        Field(name="failure_count_90d", dtype=Int32),
        Field(name="equipment_age_days", dtype=Int32),
        Field(name="category", dtype=String),
        Field(name="emergency_count_30d", dtype=Int32),
    ],
    source=maintenance_source,
)
