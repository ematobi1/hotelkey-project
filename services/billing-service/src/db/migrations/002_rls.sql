-- Migration: Enable Row-Level Security for tenant isolation
-- Tables covered: folio, folio_line_item, payment

ALTER TABLE folio ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON folio
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON folio TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- folio_line_item

ALTER TABLE folio_line_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE folio_line_item FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON folio_line_item
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON folio_line_item TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- payment

ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY tenant_isolation ON payment
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY superuser_bypass ON payment TO postgres USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
