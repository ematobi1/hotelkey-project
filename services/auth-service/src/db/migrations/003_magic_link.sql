CREATE TABLE IF NOT EXISTS guest_magic_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  guest_id UUID NOT NULL,
  reservation_id UUID NOT NULL,
  guest_email VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_magic_link_token_hash ON guest_magic_link(token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_link_guest ON guest_magic_link(tenant_id, guest_id);
