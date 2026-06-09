-- RLS for pms-service
-- tenant table has no tenant_id (it IS the tenant); RLS not applicable
-- room_type is scoped per tenant

ALTER TABLE room_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_type FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON room_type
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON room_type TO hotelkey USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
