-- Creator FAQ — Full Database Schema
-- Reference schema for a fresh Postgres + pgvector database.
-- (The live DB is initialized from docker/init-db.sql; this is the source mirror.)

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Channels
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

-- Collections (curated channel groups)
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Channel <-> Collection junction
CREATE TABLE IF NOT EXISTS channel_collections (
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (channel_id, collection_id)
);

-- Videos
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
    video_type TEXT DEFAULT 'video', -- video, live, short
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transcripts
CREATE TABLE IF NOT EXISTS transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE UNIQUE,
    raw_text TEXT,
    cleaned_text TEXT,
    summary TEXT,
    source TEXT, -- youtube_captions, extractor, whisper
    processing_status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Video <-> Tag junction
CREATE TABLE IF NOT EXISTS video_tags (
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (video_id, tag_id)
);

-- Ingestion logs
CREATE TABLE IF NOT EXISTS ingestion_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    status TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Transcript chunks for vector search
CREATE TABLE IF NOT EXISTS transcript_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    start_time INTEGER,
    end_time INTEGER,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_youtube_id ON videos(youtube_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_transcripts_video ON transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_raw_text_search ON transcripts USING GIN(to_tsvector('english', COALESCE(raw_text, '')));
CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug);
CREATE INDEX IF NOT EXISTS idx_channel_collections_collection ON channel_collections(collection_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_video ON ingestion_logs(video_id);

-- Vector search index
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_embedding ON transcript_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Vector search function
CREATE OR REPLACE FUNCTION match_transcript_chunks (
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    video_id uuid,
    content text,
    start_time integer,
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

-- Seed: UFO/NHI collection
INSERT INTO collections (name, slug, description)
VALUES ('UFO & NHI', 'ufo', 'Unidentified Aerial Phenomena and Non-Human Intelligence research channels')
ON CONFLICT (slug) DO NOTHING;
