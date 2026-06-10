DO $$ BEGIN
  CREATE TYPE work_order_status AS ENUM ('open', 'assigned', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE work_order_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE work_order_category AS ENUM ('plumbing', 'electrical', 'hvac', 'furniture', 'cleaning', 'safety', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS work_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  room_id UUID,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category work_order_category NOT NULL DEFAULT 'other',
  priority work_order_priority NOT NULL DEFAULT 'medium',
  status work_order_status NOT NULL DEFAULT 'open',
  assigned_to UUID,
  reported_by UUID NOT NULL,
  completed_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_order_tenant_id ON work_order(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_order_status ON work_order(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_work_order_room_id ON work_order(room_id) WHERE room_id IS NOT NULL;
