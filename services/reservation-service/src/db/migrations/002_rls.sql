-- Migration: Enable Row-Level Security for tenant isolation
-- Tables covered: rate_plan, reservation

ALTER TABLE rate_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plan FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON rate_plan
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON rate_plan TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- reservation

ALTER TABLE reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON reservation
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON reservation TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
