-- Migration: Enable Row-Level Security for tenant isolation
-- Tables covered: notification_template, notification_preference, notification_log
--
-- Note: notification_template.tenant_id is nullable (global/shared templates have
-- tenant_id IS NULL). Those rows will not be visible under any tenant session via
-- the tenant_isolation policy — intentional safe default. The superuser_bypass
-- policy allows the postgres role to read all rows including global templates.

ALTER TABLE notification_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_template FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON notification_template
        USING (
            tenant_id = current_setting('app.tenant_id', true)::uuid
            OR tenant_id IS NULL
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON notification_template TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- notification_preference

ALTER TABLE notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preference FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON notification_preference
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON notification_preference TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- notification_log

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON notification_log
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON notification_log TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
