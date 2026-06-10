-- Local mirror of on-chain consent for fast reads (eventual consistency with chain)
CREATE TABLE IF NOT EXISTS consent_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  guest_id UUID NOT NULL,
  guest_id_hash VARCHAR(64) NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'granted',
  tx_id VARCHAR(255),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_cache_active ON consent_cache(tenant_id, guest_id, purpose);
CREATE INDEX IF NOT EXISTS idx_consent_cache_guest ON consent_cache(tenant_id, guest_id);
