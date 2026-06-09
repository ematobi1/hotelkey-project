-- Enable pgvector extension for semantic similarity search on BI queries
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to bi_conversation for semantic caching
ALTER TABLE bi_conversation
  ADD COLUMN IF NOT EXISTS query_embedding vector(1536);

-- Index for approximate nearest-neighbour search (cosine distance)
-- Used to find semantically similar past queries and serve cached answers
CREATE INDEX IF NOT EXISTS idx_bi_conversation_embedding
  ON bi_conversation
  USING ivfflat (query_embedding vector_cosine_ops)
  WITH (lists = 100);

-- Semantic cache table: stores pre-computed answers for common query clusters
CREATE TABLE IF NOT EXISTS bi_semantic_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  representative_question TEXT NOT NULL,
  answer TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '6 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cosine similarity index on semantic cache
CREATE INDEX IF NOT EXISTS idx_bi_semantic_cache_embedding
  ON bi_semantic_cache
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_bi_semantic_cache_tenant
  ON bi_semantic_cache(tenant_id, expires_at);
