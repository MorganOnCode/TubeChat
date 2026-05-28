-- tubechat (OpenTube Creator Hub) initial schema for self-hosted Postgres.
-- Applied automatically by the postgres image on first boot
-- (/docker-entrypoint-initdb.d/*.sql runs once when the data volume is empty).
-- Idempotent: safe to re-run by hand against an existing DB.
--
-- Mirrors supabase/schema.sql + migrations, verified against the live DB's
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
  source TEXT,                       -- youtube_captions, extractor, whisper
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

-- Seed: UFO/NHI collection (matches supabase/schema.sql)
INSERT INTO collections (name, slug, description)
VALUES ('UFO & NHI', 'ufo', 'Unidentified Aerial Phenomena and Non-Human Intelligence research channels')
ON CONFLICT (slug) DO NOTHING;
