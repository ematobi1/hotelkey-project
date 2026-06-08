CREATE TABLE IF NOT EXISTS guest (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(30),
    nationality     CHAR(2),
    date_of_birth   DATE,
    vip_level       SMALLINT NOT NULL DEFAULT 0,
    is_blocked      BOOLEAN NOT NULL DEFAULT FALSE,
    block_reason    TEXT,
    deleted_at      TIMESTAMPTZ,
    anonymised_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT guest_vip_level_chk CHECK (vip_level BETWEEN 0 AND 3)
);

CREATE INDEX IF NOT EXISTS idx_guest_email
    ON guest (tenant_id, email) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_guest_phone
    ON guest (tenant_id, phone) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_guest_name
    ON guest (tenant_id, last_name, first_name) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS guest_preference (
    guest_id            UUID PRIMARY KEY REFERENCES guest (id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL,
    room_type_id        UUID,
    floor_preference    SMALLINT,
    pillow_type         VARCHAR(50),
    dietary             TEXT[] NOT NULL DEFAULT '{}',
    other_preferences   JSONB NOT NULL DEFAULT '{}',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guest_document (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id        UUID NOT NULL REFERENCES guest (id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL,
    doc_type        VARCHAR(30) NOT NULL,
    doc_number_enc  BYTEA NOT NULL,
    issuing_country CHAR(2),
    expiry_date     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guest_doc_guest ON guest_document (guest_id);
