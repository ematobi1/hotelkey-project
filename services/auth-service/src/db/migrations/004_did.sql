CREATE TABLE IF NOT EXISTS guest_did (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  guest_id UUID NOT NULL UNIQUE,
  did VARCHAR(255) NOT NULL UNIQUE,  -- e.g. did:key:z6Mk...
  did_document JSONB NOT NULL,
  public_key_multibase TEXT NOT NULL,  -- Ed25519 public key
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guest_did_tenant ON guest_did(tenant_id, guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_did_did ON guest_did(did);
