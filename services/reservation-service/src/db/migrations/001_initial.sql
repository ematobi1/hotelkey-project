DO $$ BEGIN
    CREATE TYPE reservation_status AS ENUM (
        'tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rate_plan (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(20) NOT NULL,
    description     TEXT,
    rate_multiplier DECIMAL(5, 4) NOT NULL DEFAULT 1.0000,
    min_nights      SMALLINT NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rate_plan_tenant_code_uq UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS reservation (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    confirmation_code   VARCHAR(12) NOT NULL UNIQUE,
    guest_id            UUID NOT NULL,
    room_id             UUID NOT NULL,
    rate_plan_id        UUID REFERENCES rate_plan (id),
    check_in_date       DATE NOT NULL,
    check_out_date      DATE NOT NULL,
    actual_check_in     TIMESTAMPTZ,
    actual_check_out    TIMESTAMPTZ,
    status              reservation_status NOT NULL DEFAULT 'confirmed',
    source              VARCHAR(50) NOT NULL DEFAULT 'direct',
    channel_booking_ref VARCHAR(100),
    adults              SMALLINT NOT NULL DEFAULT 1,
    children            SMALLINT NOT NULL DEFAULT 0,
    rate_per_night      DECIMAL(10, 2) NOT NULL,
    total_amount        DECIMAL(10, 2) NOT NULL,
    currency_code       CHAR(3) NOT NULL,
    special_requests    TEXT,
    internal_notes      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reservation_dates_chk CHECK (check_out_date > check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_reservation_guest
    ON reservation (tenant_id, guest_id);

CREATE INDEX IF NOT EXISTS idx_reservation_room_dates
    ON reservation (room_id, check_in_date, check_out_date)
    WHERE status NOT IN ('cancelled', 'no_show');

CREATE INDEX IF NOT EXISTS idx_reservation_dates
    ON reservation (tenant_id, check_in_date, check_out_date);

CREATE INDEX IF NOT EXISTS idx_reservation_status
    ON reservation (tenant_id, status);
