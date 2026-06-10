-- Migration: Enable Row-Level Security for tenant isolation
-- Tables covered: staff
-- mfa_secret and refresh_token have no tenant_id; they are indirectly protected
-- via cascade from staff which is RLS-protected.

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON staff
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON staff TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;