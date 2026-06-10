-- Staff table
CREATE TABLE IF NOT EXISTS staff (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    role            VARCHAR(50) NOT NULL DEFAULT 'front_desk',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT staff_tenant_email_uq UNIQUE (tenant_id, email),
    CONSTRAINT staff_role_chk CHECK (
        role IN ('super_admin', 'admin', 'front_desk', 'housekeeping', 'maintenance')
    )
);

CREATE INDEX IF NOT EXISTS idx_staff_email ON staff (tenant_id, email) WHERE is_active = TRUE;

-- MFA secrets (TOTP, encrypted at rest)
CREATE TABLE IF NOT EXISTS mfa_secret (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
    secret_enc      BYTEA NOT NULL,
    iv              BYTEA NOT NULL,
    auth_tag        BYTEA NOT NULL,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mfa_secret_staff_uq UNIQUE (staff_id)
);

-- Refresh tokens (hashed)
CREATE TABLE IF NOT EXISTS refresh_token (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id    UUID NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT refresh_token_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_hash
    ON refresh_token (token_hash)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_token_staff
    ON refresh_token (staff_id)
    WHERE revoked_at IS NULL;
