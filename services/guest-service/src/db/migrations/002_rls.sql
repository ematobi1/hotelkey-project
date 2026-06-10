-- Migration: Enable Row-Level Security for tenant isolation
-- Tables covered: guest, guest_preference, guest_document

ALTER TABLE guest ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON guest
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON guest TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- guest_preference

ALTER TABLE guest_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_preference FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON guest_preference
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON guest_preference TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- guest_document

ALTER TABLE guest_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_document FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON guest_document
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON guest_document TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;