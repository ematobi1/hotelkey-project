DO $$ BEGIN
    CREATE TYPE room_status AS ENUM (
        'clean', 'dirty', 'occupied', 'inspecting', 'maintenance', 'out_of_order'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS room_type (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    base_rate       DECIMAL(10, 2) NOT NULL,
    currency_code   CHAR(3) NOT NULL,
    max_occupancy   SMALLINT NOT NULL,
    bed_config      JSONB NOT NULL DEFAULT '[]',
    size_sqm        DECIMAL(6, 2),
    images          JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT room_type_tenant_name_uq UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS room (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    room_number             VARCHAR(10) NOT NULL,
    floor                   SMALLINT NOT NULL,
    wing                    VARCHAR(50),
    room_type_id            UUID NOT NULL REFERENCES room_type (id),
    status                  room_status NOT NULL DEFAULT 'clean',
    amenities               JSONB NOT NULL DEFAULT '[]',
    max_occupancy           SMALLINT NOT NULL DEFAULT 2,
    is_accessible           BOOLEAN NOT NULL DEFAULT FALSE,
    notes                   TEXT,
    last_maintenance_date   DATE,
    next_maintenance_due    DATE,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT room_tenant_number_uq UNIQUE (tenant_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_room_tenant_status
    ON room (tenant_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_room_tenant_type
    ON room (tenant_id, room_type_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS maintenance_ticket (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    room_id     UUID NOT NULL REFERENCES room (id),
    issue       TEXT NOT NULL,
    severity    VARCHAR(20) NOT NULL DEFAULT 'medium',
    reported_by UUID NOT NULL,
    assigned_to UUID,
    resolved_at TIMESTAMPTZ,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT maintenance_severity_chk CHECK (
        severity IN ('low', 'medium', 'high', 'critical')
    )
);

CREATE INDEX IF NOT EXISTS idx_maintenance_room ON maintenance_ticket (room_id, resolved_at);
