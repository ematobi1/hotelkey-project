CREATE TYPE IF NOT EXISTS hk_task_type AS ENUM (
    'departure_clean', 'stay_over_clean', 'turn_down', 'inspection',
    'deep_clean', 'maintenance_prep', 'amenity_restock'
);

CREATE TYPE IF NOT EXISTS hk_task_status AS ENUM (
    'pending', 'assigned', 'in_progress', 'completed', 'skipped'
);

CREATE TYPE IF NOT EXISTS hk_staff_status AS ENUM ('available', 'busy', 'off_duty');

CREATE TABLE IF NOT EXISTS hk_staff (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    current_floor   SMALLINT,
    shift_start     TIME NOT NULL,
    shift_end       TIME NOT NULL,
    status          hk_staff_status NOT NULL DEFAULT 'off_duty',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hk_staff_tenant ON hk_staff (tenant_id, status);

CREATE TABLE IF NOT EXISTS hk_task (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    room_id         UUID NOT NULL,
    reservation_id  UUID,
    task_type       hk_task_type NOT NULL,
    status          hk_task_status NOT NULL DEFAULT 'pending',
    priority        SMALLINT NOT NULL DEFAULT 2,
    assigned_to     UUID REFERENCES hk_staff (id),
    due_at          TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT hk_task_priority_chk CHECK (priority BETWEEN 1 AND 3)
);

CREATE INDEX IF NOT EXISTS idx_hk_task_date
    ON hk_task (tenant_id, due_at) WHERE status NOT IN ('completed', 'skipped');

CREATE INDEX IF NOT EXISTS idx_hk_task_room ON hk_task (room_id, status);
CREATE INDEX IF NOT EXISTS idx_hk_task_assignee ON hk_task (assigned_to, status);

CREATE TABLE IF NOT EXISTS hk_inspection (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         UUID NOT NULL REFERENCES hk_task (id),
    tenant_id       UUID NOT NULL,
    passed          BOOLEAN NOT NULL,
    notes           TEXT,
    inspector_id    UUID NOT NULL,
    inspected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
