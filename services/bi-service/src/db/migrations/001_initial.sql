CREATE TABLE IF NOT EXISTS bi_conversation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  tool_calls_made JSONB DEFAULT '[]',
  response_time_ms INTEGER,
  model_version VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bi_conversation_tenant ON bi_conversation(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bi_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cache_key VARCHAR(255) NOT NULL,
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_cache_key ON bi_cache(tenant_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_bi_cache_expires ON bi_cache(expires_at);
