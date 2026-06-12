-- Search & ask-box efficiency upgrade (feat/search-efficiency, 2026-06-12).
-- Idempotent — safe to re-run. Apply to an existing prod DB with:
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U tubechat -d tubechat < db/migrations/search_efficiency.sql
--
-- Adds, with NO behavior change until the app is deployed + cut over:
--   * chunk-level FTS index            (Phase B: hybrid vector+keyword retrieval)
--   * app_meta / corpus_version        (Phase C: cache invalidation key)
--   * query_cache                      (Phase C: response cache + curated pre-warm)
--   * query_logs                       (Phase D: eval set + telemetry)
--   * embedding_v2 vector(512) + RPC   (Phase A: shadow column for the 512-dim
--                                        re-embed; the live 1536 `embedding`
--                                        column keeps serving until cutover)
-- The 512-dim ANN index is built AFTER backfill — see the cutover note at the end.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Phase B: chunk-level full-text index (today FTS only exists on transcripts.raw_text)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_content_fts
  ON transcript_chunks USING GIN (to_tsvector('english', content));

-- ---------------------------------------------------------------------------
-- Phase C: corpus version (bumped by the re-embed script → invalidates the cache)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO app_meta (key, value) VALUES ('corpus_version', '1')
  ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Phase C: response cache. cache_key = sha256(corpus_version|scope|mode|question).
-- Curated rows (pre-warmed suggested questions) serve free + instantly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS query_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key           TEXT NOT NULL UNIQUE,
  corpus_version      TEXT NOT NULL,
  scope_key           TEXT NOT NULL DEFAULT '',
  normalized_question TEXT NOT NULL,
  mode                TEXT NOT NULL DEFAULT 'answer',  -- answer | extracts
  payload             JSONB NOT NULL,                  -- { answer, sources, extracts, searchQuery, topSimilarity }
  curated             BOOLEAN NOT NULL DEFAULT false,
  hits                INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_used_at        TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Phase D: query log (eval set + "what do users ask" + cache-hit telemetry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS query_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question     TEXT NOT NULL,
  search_query TEXT,
  scope_key    TEXT,
  mode         TEXT,            -- answer | extracts | not_covered | direct | cached
  cache_hit    BOOLEAN NOT NULL DEFAULT false,
  chunk_ids    JSONB,           -- retrieved chunk ids (for the eval set)
  top_score    REAL,            -- top raw vector similarity (confidence signal)
  answer_chars INTEGER,
  tokens_used  INTEGER,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_query_logs_created ON query_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- Phase A: shadow 512-dim column + RPC. Additive — the live 1536 `embedding`
-- column and match_transcript_chunks() keep serving until EMBED_DIMS flips to 512.
-- ---------------------------------------------------------------------------
ALTER TABLE transcript_chunks ADD COLUMN IF NOT EXISTS embedding_v2 vector(512);

CREATE OR REPLACE FUNCTION match_transcript_chunks_v2 (
  query_embedding vector(512),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  video_id UUID,
  content TEXT,
  start_time INTEGER,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.id,
    tc.video_id,
    tc.content,
    tc.start_time,
    1 - (tc.embedding_v2 <=> query_embedding) AS similarity
  FROM transcript_chunks tc
  WHERE tc.embedding_v2 IS NOT NULL
    AND 1 - (tc.embedding_v2 <=> query_embedding) > match_threshold
  ORDER BY tc.embedding_v2 <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- CUTOVER (run only AFTER `npm run reembed` has backfilled embedding_v2):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transcript_chunks_embedding_v2
--     ON transcript_chunks USING hnsw (embedding_v2 vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
-- Then set EMBED_DIMS=512 on the web container and redeploy. To roll back,
-- set EMBED_DIMS=1536 (the 1536 `embedding` column is untouched).
-- Final cleanup once 512 is proven, in a later migration:
--   DROP INDEX IF EXISTS idx_transcript_chunks_embedding;
--   ALTER TABLE transcript_chunks DROP COLUMN embedding;
--   ALTER TABLE transcript_chunks RENAME COLUMN embedding_v2 TO embedding;  (+ rename RPC/index)
-- ---------------------------------------------------------------------------
