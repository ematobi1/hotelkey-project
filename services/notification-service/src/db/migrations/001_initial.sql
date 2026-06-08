CREATE TABLE IF NOT EXISTS notification_template (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID,
    name        VARCHAR(100) NOT NULL,
    channel     VARCHAR(20) NOT NULL,
    language    CHAR(5) NOT NULL DEFAULT 'en',
    subject     VARCHAR(255),
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_template_uq UNIQUE (tenant_id, name, channel, language),
    CONSTRAINT notification_channel_chk CHECK (channel IN ('email', 'sms', 'push', 'in_app'))
);

CREATE TABLE IF NOT EXISTS notification_preference (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    recipient_id    UUID NOT NULL,
    recipient_type  VARCHAR(20) NOT NULL,
    channel         VARCHAR(20) NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    opted_in        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_pref_uq UNIQUE (tenant_id, recipient_id, channel, event_type)
);

CREATE TABLE IF NOT EXISTS notification_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    recipient_id    UUID,
    channel         VARCHAR(20) NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    template_name   VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    provider_ref    VARCHAR(255),
    error_message   TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_log_status_chk CHECK (
        status IN ('pending', 'sent', 'failed', 'skipped')
    )
);

CREATE INDEX IF NOT EXISTS idx_notif_log_tenant_created
    ON notification_log (tenant_id, created_at DESC);
