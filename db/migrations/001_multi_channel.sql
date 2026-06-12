-- Add slug to channels for URL routing
ALTER TABLE channels ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Create collections table
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Junction table: channels <-> collections
CREATE TABLE IF NOT EXISTS channel_collections (
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (channel_id, collection_id)
);

-- Index for fast collection lookups
CREATE INDEX IF NOT EXISTS idx_channel_collections_collection ON channel_collections(collection_id);
CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug);

-- Insert UFO/NHI collection
INSERT INTO collections (name, slug, description) 
VALUES ('UFO & NHI', 'ufo', 'Unidentified Aerial Phenomena and Non-Human Intelligence research channels')
ON CONFLICT (slug) DO NOTHING;
