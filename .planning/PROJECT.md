# Creator FAQ

## Brief
A YouTube transcript library and research engine. Ingest any YouTube channel, extract and process transcripts with AI, and publish a searchable public website with per-creator pages, curated collections, and markdown downloads.

## Origin
Rebuild of OpenTube (Charles [removed] transcript site). Generalising to support any YouTube channel with curated topic collections. First collection: UFO/NHI channels.

## Stack
Next.js 16 + Supabase (→ self-hosted Postgres) + Claude Sonnet 4.6 + Whisper + Tailwind + Hetzner VPS

## Key Decisions
- Evolve OpenTube codebase, don't rewrite
- Keep Whisper for audio transcription (Claude can't do audio)
- Replace GPT-4o-mini with Claude Sonnet 4.6 for text processing
- Start with Supabase free tier, migrate to self-hosted later
- Self-host on Hetzner (not Vercel)
- Original OpenTube repo/deployment untouched
