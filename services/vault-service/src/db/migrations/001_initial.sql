CREATE TABLE IF NOT EXISTS pii_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  guest_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  encrypted_value TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pii_record_guest ON pii_record(tenant_id, guest_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pii_record_field ON pii_record(tenant_id, guest_id, field_name);
