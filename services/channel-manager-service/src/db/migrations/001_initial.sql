-- maps hotel-key room types to SiteMinder room codes
CREATE TABLE IF NOT EXISTS channel_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  hotel_key_room_type_id UUID NOT NULL,
  siteminder_room_type_code VARCHAR(50) NOT NULL,
  siteminder_rate_plan_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_mapping_room_type ON channel_mapping(tenant_id, hotel_key_room_type_id);

-- incoming bookings received from SiteMinder
CREATE TABLE IF NOT EXISTS channel_booking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  siteminder_booking_id VARCHAR(255) NOT NULL UNIQUE,
  reservation_id UUID,  -- filled after creating reservation in reservation-service
  raw_payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'received',  -- received | processed | failed
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_channel_booking_tenant ON channel_booking(tenant_id, status);
