CREATE TABLE IF NOT EXISTS integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  integration_name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_config_tenant ON integration_config(tenant_id, integration_name);

CREATE TABLE IF NOT EXISTS integration_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  integration_name VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL,
  payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_event_log ON integration_event_log(tenant_id, integration_name, created_at DESC);
