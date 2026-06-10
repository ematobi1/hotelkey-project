# Data Models

## Design Principles
- Every table has `id` (UUID), `created_at`, `updated_at`, `tenant_id`
- Soft-delete via `deleted_at` (nullable) for guest-generated content
- Foreign keys always have covering indexes
- JSONB columns used for genuinely flexible data (amenities, preferences) — not a workaround for poor schema design

---

## Core Entities

### Hotel (tenant root)
```sql
CREATE TABLE hotel (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,           -- Same as id for root tenant
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    address_line1   VARCHAR(255),
    address_line2   VARCHAR(255),
    city            VARCHAR(100),
    country_code    CHAR(2) NOT NULL,        -- ISO 3166-1 alpha-2
    currency_code   CHAR(3) NOT NULL,        -- ISO 4217
    timezone        VARCHAR(50) NOT NULL,    -- IANA tz
    check_in_time   TIME NOT NULL DEFAULT '15:00',
    check_out_time  TIME NOT NULL DEFAULT '11:00',
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Room (core operational entity)
```sql
CREATE TABLE room (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES hotel(id),
    room_number              VARCHAR(10) NOT NULL,
    floor                    SMALLINT NOT NULL,
    wing                     VARCHAR(50),
    room_type_id             UUID NOT NULL REFERENCES room_type(id),
    status                   room_status NOT NULL DEFAULT 'clean',
    -- Predictive maintenance fields
    last_maintenance_date    DATE,
    next_maintenance_due     DATE,
    cumulative_operating_hours DECIMAL(10,2) DEFAULT 0,
    hvac_unit_id             VARCHAR(50),    -- External HVAC asset tag
    plumbing_last_inspected  DATE,
    -- Metadata
    amenities                JSONB NOT NULL DEFAULT '[]',  -- ["wifi","safe","minibar"]
    max_occupancy            SMALLINT NOT NULL DEFAULT 2,
    is_accessible            BOOLEAN NOT NULL DEFAULT FALSE,
    notes                    TEXT,
    deleted_at               TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, room_number)
);

CREATE TYPE room_status AS ENUM (
    'clean',
    'dirty',
    'occupied',
    'inspecting',
    'maintenance',
    'out_of_order'
);

CREATE INDEX idx_room_tenant_status ON room(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_room_tenant_type ON room(tenant_id, room_type_id);
```

---

### Room Type
```sql
CREATE TABLE room_type (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES hotel(id),
    name            VARCHAR(100) NOT NULL,   -- "Deluxe King", "Junior Suite"
    description     TEXT,
    base_rate       DECIMAL(10,2) NOT NULL,
    currency_code   CHAR(3) NOT NULL,
    max_occupancy   SMALLINT NOT NULL,
    bed_config      JSONB NOT NULL,          -- [{"type":"king","count":1}]
    size_sqm        DECIMAL(6,2),
    images          JSONB DEFAULT '[]',      -- S3 URLs
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, name)
);
```

---

### Guest
```sql
CREATE TABLE guest (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES hotel(id),
    -- Identity
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    nationality     CHAR(2),                 -- ISO 3166-1 alpha-2
    date_of_birth   DATE,
    -- DID (Phase 2) — stores the W3C DID string, not personal data
    did             VARCHAR(255),
    -- Status
    vip_level       SMALLINT DEFAULT 0,     -- 0=none, 1=silver, 2=gold, 3=platinum
    is_blocked      BOOLEAN DEFAULT FALSE,
    block_reason    TEXT,
    -- GDPR
    deleted_at      TIMESTAMPTZ,            -- Soft-delete
    anonymised_at   TIMESTAMPTZ,            -- When GDPR erasure was applied
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Encrypted document references (passport, ID)
CREATE TABLE guest_document (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id        UUID NOT NULL REFERENCES guest(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL,
    doc_type        VARCHAR(30) NOT NULL,    -- 'passport', 'drivers_license'
    doc_number_enc  BYTEA NOT NULL,          -- AES-256 encrypted via AWS KMS
    issuing_country CHAR(2),
    expiry_date     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guest_email ON guest(tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_guest_phone ON guest(tenant_id, phone) WHERE deleted_at IS NULL;
```

---

### Reservation
```sql
CREATE TABLE reservation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES hotel(id),
    confirmation_code   VARCHAR(12) NOT NULL UNIQUE,  -- Human-readable, e.g. "HK-A8X2Y3"
    guest_id            UUID NOT NULL REFERENCES guest(id),
    room_id             UUID NOT NULL REFERENCES room(id),
    rate_plan_id        UUID REFERENCES rate_plan(id),
    -- Dates
    check_in_date       DATE NOT NULL,
    check_out_date      DATE NOT NULL,
    actual_check_in     TIMESTAMPTZ,
    actual_check_out    TIMESTAMPTZ,
    -- Status
    status              reservation_status NOT NULL DEFAULT 'confirmed',
    source              VARCHAR(50) NOT NULL DEFAULT 'direct',  -- 'booking.com', 'expedia', 'direct'
    channel_booking_ref VARCHAR(100),        -- OTA confirmation number
    -- Occupancy
    adults              SMALLINT NOT NULL DEFAULT 1,
    children            SMALLINT NOT NULL DEFAULT 0,
    -- Financials
    rate_per_night      DECIMAL(10,2) NOT NULL,
    total_amount        DECIMAL(10,2) NOT NULL,
    currency_code       CHAR(3) NOT NULL,
    -- Notes
    special_requests    TEXT,
    internal_notes      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_dates CHECK (check_out_date > check_in_date)
);

CREATE TYPE reservation_status AS ENUM (
    'tentative',    -- Provisional hold
    'confirmed',    -- Deposit/guarantee received
    'checked_in',
    'checked_out',
    'cancelled',
    'no_show'
);

CREATE INDEX idx_reservation_guest ON reservation(tenant_id, guest_id);
CREATE INDEX idx_reservation_room_dates ON reservation(room_id, check_in_date, check_out_date)
    WHERE status NOT IN ('cancelled', 'no_show');
CREATE INDEX idx_reservation_dates ON reservation(tenant_id, check_in_date, check_out_date);
```

---

### Folio (Guest Bill)
```sql
CREATE TABLE folio (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    reservation_id  UUID NOT NULL REFERENCES reservation(id),
    guest_id        UUID NOT NULL REFERENCES guest(id),
    status          folio_status NOT NULL DEFAULT 'open',
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE folio_status AS ENUM ('open', 'closed', 'disputed');

CREATE TABLE folio_line_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio_id        UUID NOT NULL REFERENCES folio(id),
    tenant_id       UUID NOT NULL,
    description     VARCHAR(255) NOT NULL,
    charge_type     VARCHAR(50) NOT NULL,   -- 'accommodation', 'food_beverage', 'spa', 'tax', 'fee'
    quantity        DECIMAL(8,3) NOT NULL DEFAULT 1,
    unit_amount     DECIMAL(10,2) NOT NULL,
    total_amount    DECIMAL(10,2) NOT NULL,  -- quantity * unit_amount
    tax_amount      DECIMAL(10,2) DEFAULT 0,
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_by       UUID,                    -- staff_id or NULL for system posts
    voided_at       TIMESTAMPTZ,
    void_reason     TEXT,
    idempotency_key VARCHAR(64) UNIQUE       -- Prevents duplicate charge posting
);

CREATE INDEX idx_folio_reservation ON folio(reservation_id);
CREATE INDEX idx_line_folio ON folio_line_item(folio_id) WHERE voided_at IS NULL;
```

---

### IoT Sensor Readings (TimescaleDB Hypertable)
```sql
CREATE TABLE room_sensor_reading (
    time            TIMESTAMPTZ NOT NULL,
    room_id         UUID NOT NULL,
    tenant_id       UUID NOT NULL,
    sensor_type     VARCHAR(30) NOT NULL,   -- 'temperature', 'humidity', 'motion', 'energy_kwh', 'water_flow_lpm'
    value           DECIMAL(12,4) NOT NULL,
    unit            VARCHAR(20) NOT NULL,
    sensor_id       VARCHAR(64),            -- Physical device ID
    PRIMARY KEY (room_id, sensor_type, time)
);

-- Convert to hypertable partitioned by time (7-day chunks)
SELECT create_hypertable('room_sensor_reading', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Compression policy: compress chunks older than 30 days
SELECT add_compression_policy('room_sensor_reading', INTERVAL '30 days');

-- Retention policy: drop data older than 2 years
SELECT add_retention_policy('room_sensor_reading', INTERVAL '2 years');

-- Continuous aggregate for hourly averages (used by ML models)
CREATE MATERIALIZED VIEW room_sensor_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    room_id,
    tenant_id,
    sensor_type,
    AVG(value)   AS avg_value,
    MIN(value)   AS min_value,
    MAX(value)   AS max_value,
    COUNT(*)     AS reading_count
FROM room_sensor_reading
GROUP BY bucket, room_id, tenant_id, sensor_type;

CREATE INDEX idx_sensor_room_type ON room_sensor_reading(room_id, sensor_type, time DESC);
```

---

### Housekeeping Task
```sql
CREATE TABLE hk_task (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    room_id         UUID NOT NULL REFERENCES room(id),
    reservation_id  UUID REFERENCES reservation(id),
    task_type       hk_task_type NOT NULL,
    status          hk_task_status NOT NULL DEFAULT 'pending',
    priority        SMALLINT NOT NULL DEFAULT 2,  -- 1=urgent, 2=normal, 3=low
    assigned_to     UUID,                         -- hk_staff.id
    due_at          TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE hk_task_type AS ENUM (
    'departure_clean',
    'stay_over_clean',
    'turn_down',
    'inspection',
    'deep_clean',
    'maintenance_prep',
    'amenity_restock'
);

CREATE TYPE hk_task_status AS ENUM (
    'pending',
    'assigned',
    'in_progress',
    'completed',
    'skipped'
);

CREATE INDEX idx_hk_task_date ON hk_task(tenant_id, due_at) WHERE status NOT IN ('completed','skipped');
CREATE INDEX idx_hk_task_room ON hk_task(room_id, status);
```

---

## Database Strategy Summary

| Data Type | Storage | Reason |
|---|---|---|
| Operational PMS data | PostgreSQL 16 | ACID transactions, relational integrity, multi-tenant schema isolation |
| IoT time-series | TimescaleDB (PG extension) | Columnar compression, continuous aggregates, same DB cluster |
| Sessions, locks, cache | Redis 7 | Sub-millisecond latency, TTL-based expiry |
| Audit logs, event archive | MongoDB 7 | Variable schema, high write throughput, no joins needed |
| Guest consent ledger | Hyperledger Fabric | Immutable, auditable, permissioned |
| ML training data | S3 + Parquet | Cost-effective, columnar format for analytics queries |
| Model artifacts | S3 + MLflow | Versioned, A/B testable |
