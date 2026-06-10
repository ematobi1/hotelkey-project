DO $$ BEGIN
    CREATE TYPE folio_status AS ENUM ('open', 'closed', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'pending', 'authorized', 'captured', 'refunded', 'failed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS folio (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    reservation_id  UUID NOT NULL UNIQUE,
    guest_id        UUID NOT NULL,
    status          folio_status NOT NULL DEFAULT 'open',
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folio_reservation ON folio (reservation_id);
CREATE INDEX IF NOT EXISTS idx_folio_guest ON folio (tenant_id, guest_id);

CREATE TABLE IF NOT EXISTS folio_line_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio_id        UUID NOT NULL REFERENCES folio (id),
    tenant_id       UUID NOT NULL,
    description     VARCHAR(255) NOT NULL,
    charge_type     VARCHAR(30) NOT NULL,
    quantity        DECIMAL(8, 3) NOT NULL DEFAULT 1,
    unit_amount     DECIMAL(10, 2) NOT NULL,
    total_amount    DECIMAL(10, 2) NOT NULL,
    tax_amount      DECIMAL(10, 2) NOT NULL DEFAULT 0,
    posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_by       UUID,
    voided_at       TIMESTAMPTZ,
    void_reason     TEXT,
    idempotency_key VARCHAR(64) UNIQUE,
    CONSTRAINT line_item_charge_type_chk CHECK (
        charge_type IN ('accommodation', 'food_beverage', 'spa', 'tax', 'fee', 'minibar', 'parking', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_line_item_folio
    ON folio_line_item (folio_id) WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS payment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folio_id        UUID NOT NULL REFERENCES folio (id),
    tenant_id       UUID NOT NULL,
    provider        VARCHAR(20) NOT NULL DEFAULT 'stripe',
    provider_ref    VARCHAR(255) NOT NULL,
    amount          DECIMAL(10, 2) NOT NULL,
    currency_code   CHAR(3) NOT NULL,
    status          payment_status NOT NULL DEFAULT 'pending',
    captured_at     TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_folio ON payment (folio_id);
