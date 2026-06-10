-- Migration: Enable Row-Level Security for tenant isolation
-- Tables covered: room_type, room, maintenance_ticket

ALTER TABLE room_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_type FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON room_type
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON room_type TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- room

ALTER TABLE room ENABLE ROW LEVEL SECURITY;
ALTER TABLE room FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON room
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON room TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- maintenance_ticket

ALTER TABLE maintenance_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_ticket FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON maintenance_ticket
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    EXECUTE format('CREATE POLICY superuser_bypass ON maintenance_ticket TO %I USING (true)', current_user);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;