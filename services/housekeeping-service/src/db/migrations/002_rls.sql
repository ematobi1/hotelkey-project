-- Migration: Enable Row-Level Security for tenant isolation
-- Tables covered: hk_staff, hk_task, hk_inspection

ALTER TABLE hk_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk_staff FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON hk_staff
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON hk_staff TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- hk_task

ALTER TABLE hk_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk_task FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON hk_task
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON hk_task TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- hk_inspection

ALTER TABLE hk_inspection ENABLE ROW LEVEL SECURITY;
ALTER TABLE hk_inspection FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON hk_inspection
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON hk_inspection TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;