-- locks registered per tenant
CREATE TABLE IF NOT EXISTS lock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  room_id UUID NOT NULL,
  assa_abloy_lock_id VARCHAR(255) NOT NULL,
  label VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lock_room ON lock(tenant_id, room_id);

-- issued mobile key credentials
CREATE TABLE IF NOT EXISTS lock_credential (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lock_id UUID NOT NULL REFERENCES lock(id),
  reservation_id UUID NOT NULL,
  guest_id UUID NOT NULL,
  assa_abloy_credential_id VARCHAR(255) NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credential_reservation ON lock_credential(reservation_id);
CREATE INDEX IF NOT EXISTS idx_credential_lock ON lock_credential(lock_id);
