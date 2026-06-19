-- tubechat (OpenTube Creator Hub) initial schema for self-hosted Postgres.
-- Applied automatically by the postgres image on first boot
-- (/docker-entrypoint-initdb.d/*.sql runs once when the data volume is empty).
-- Idempotent: safe to re-run by hand against an existing DB.
--
-- Mirrors db/schema.sql + migrations, verified against the live DB's
-- actual columns (2026-05-28 backup). RLS removed — a single app role talks
-- to this DB, so RLS adds no security here.

-- Extensions: Supabase enables these by default; self-hosted must opt in.
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;    -- pgvector for semantic search

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  thumbnail_url TEXT,
  subscriber_count INTEGER,
  video_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_collections (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel_id, collection_id)
);

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  youtube_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  published_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  view_count INTEGER,
  video_type TEXT DEFAULT 'video',   -- video, live, short
  status TEXT DEFAULT 'pending',     -- pending, processing, completed, failed
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE UNIQUE,
  raw_text TEXT,
  cleaned_text TEXT,
  summary TEXT,
  segments JSONB,                    -- timed caption cues [{text, offset(ms), duration(ms)}] for clip/timestamp deep-links
  source TEXT,                       -- youtube_captions, extractor, whisper
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Idempotent for existing databases (CREATE TABLE IF NOT EXISTS won't add columns).
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS segments JSONB;

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_tags (
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (video_id, tag_id)
);

CREATE TABLE IF NOT EXISTS ingestion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcript_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  start_time INTEGER,
  end_time INTEGER,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Shadow column for the 512-dim re-embed (feat/search-efficiency). Additive: the
-- 1536 `embedding` column keeps serving until EMBED_DIMS flips to 512 at cutover.
ALTER TABLE transcript_chunks ADD COLUMN IF NOT EXISTS embedding_v2 vector(512);

-- error_reports: referenced by the app (submitErrorReport) but was never
-- created in the live Supabase DB. Added here so the feature works going forward.
CREATE TABLE IF NOT EXISTS error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  error_type TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp_seconds INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- answers: persisted Ask results for shareable permalinks (/a/{id}) + answer caching.
CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- app_meta: small key/value config. `corpus_version` is bumped by the re-embed
-- script and is part of the query_cache key, so a re-embed invalidates the cache.
CREATE TABLE IF NOT EXISTS app_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO app_meta (key, value) VALUES ('corpus_version', '1')
  ON CONFLICT (key) DO NOTHING;

-- query_cache: response cache for the ask box. Hit = zero LLM, instant. Curated
-- rows (pre-warmed suggested questions) serve free to free-tier users.
CREATE TABLE IF NOT EXISTS query_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key           TEXT NOT NULL UNIQUE,   -- sha256(corpus_version|scope|mode|question)
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

-- query_logs: every ask query (eval set + "what do users ask" + cache-hit telemetry).
CREATE TABLE IF NOT EXISTS query_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question     TEXT NOT NULL,
  search_query TEXT,
  scope_key    TEXT,
  mode         TEXT,            -- answer | extracts | not_covered | direct | cached
  cache_hit    BOOLEAN NOT NULL DEFAULT false,
  chunk_ids    JSONB,
  top_score    REAL,
  answer_chars INTEGER,
  tokens_used  INTEGER,
  latency_ms   INTEGER,
  provider     TEXT,            -- byok provider id (openai|anthropic|openrouter|opencode-zen) or NULL for server default
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_youtube_id ON videos(youtube_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_video ON transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug);
CREATE INDEX IF NOT EXISTS idx_channel_collections_collection ON channel_collections(collection_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_video ON ingestion_logs(video_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Full-text search indexes (searchVideos: ILIKE on title/desc, FTS on raw_text)
CREATE INDEX IF NOT EXISTS idx_transcripts_raw_text_search
  ON transcripts USING GIN(to_tsvector('english', COALESCE(raw_text, '')));
CREATE INDEX IF NOT EXISTS idx_videos_search
  ON videos USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- pgvector ANN index (ivfflat tolerates an empty table on first run)
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_embedding
  ON transcript_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Chunk-level FTS (Phase B hybrid retrieval) + query log time index (Phase D).
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_content_fts
  ON transcript_chunks USING GIN (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_query_logs_created ON query_logs(created_at DESC);
-- The 512-dim ANN index (idx_transcript_chunks_embedding_v2, hnsw) is created at
-- cutover, after `npm run reembed` backfills embedding_v2 — see search_efficiency.sql.

-- =============================================================================
-- updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at
  BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transcripts_updated_at ON transcripts;
CREATE TRIGGER update_transcripts_updated_at
  BEFORE UPDATE ON transcripts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Semantic search RPC (mirrors Supabase's match_transcript_chunks)
-- =============================================================================

CREATE OR REPLACE FUNCTION match_transcript_chunks (
  query_embedding vector(1536),
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
    transcript_chunks.id,
    transcript_chunks.video_id,
    transcript_chunks.content,
    transcript_chunks.start_time,
    1 - (transcript_chunks.embedding <=> query_embedding) AS similarity
  FROM transcript_chunks
  WHERE 1 - (transcript_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY transcript_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 512-dim variant over the shadow column (feat/search-efficiency). Used once
-- EMBED_DIMS=512; the app routes to this automatically when query vectors are 512-dim.
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

-- Seed: UFO/NHI collection (matches db/schema.sql)
INSERT INTO collections (name, slug, description)
VALUES ('UFO & NHI', 'ufo', 'Unidentified Aerial Phenomena and Non-Human Intelligence research channels')
ON CONFLICT (slug) DO NOTHING;
