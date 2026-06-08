CREATE TABLE tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  plan_type VARCHAR(50) NOT NULL DEFAULT 'starter',
  settings JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE room_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id),
  name VARCHAR(255) NOT NULL,
  bed_config VARCHAR(100) NOT NULL,
  max_occupancy INT NOT NULL CHECK (max_occupancy > 0),
  base_rate_amount NUMERIC(10,2) NOT NULL,
  base_rate_currency CHAR(3) NOT NULL DEFAULT 'USD',
  amenities TEXT[] NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_room_type_tenant_id ON room_type(tenant_id);
