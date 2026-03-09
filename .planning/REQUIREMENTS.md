# Creator FAQ — Requirements

## Overview
YouTube transcript library and research engine. Accepts any YouTube channel, ingests all videos (videos, lives, shorts), processes transcripts with LLM (clean, summarise, tag), stores in database, and serves a public website with per-creator pages, search, and markdown download.

## Rebuild Context
This is a rebuild of [HoskSaid](https://github.com/MorganOnCode/HoskSaid) — existing Next.js + Supabase + Tailwind app. The codebase is solid and will be evolved, NOT rewritten from scratch. The original HoskSaid repo and deployment (hosk-said.vercel.app) must NOT be modified.

## Core Requirements

### R1: Multi-Channel Support
- Accept any YouTube channel URL via web UI
- Auto-generate creator pages at `/creator/{channel_name}`
- Support curated channel collections at custom routes (e.g. `/ufo` shows a pre-defined list of UFO/NHI channels)
- Channel metadata: name, description, thumbnail, video count, subscriber count
- Database: channels table with youtube_id, name, slug, collection tags

### R2: Curated Collections (MVP: UFO/NHI)
- Pre-defined channel lists grouped by topic
- First collection: UFO & NHI — Morgan will provide channel list
- Route: `/ufo` → grid of curated channels with video counts
- Each channel links to `/creator/{slug}` with full transcript library
- Admin can add/remove channels from collections via CLI or config file

### R3: Transcript Ingestion Pipeline
- YouTube Data API v3 for metadata (existing, works)
- `youtube-transcript` package for caption extraction (existing, works)
- OpenAI Whisper API as fallback for videos without captions (existing, MUST keep)
- **Claude Sonnet 4.6** for LLM processing (replacing GPT-4o-mini):
  - Clean transcript (grammar, fillers, paragraphs)
  - Generate bullet-point summary (5-10 points)
  - Generate 5-10 tags
  - NOTE: Claude CANNOT transcribe audio. Whisper stays for audio→text. Claude replaces GPT only for text processing.
- Support video types: regular uploads, livestream VODs, Shorts (where captions exist)
- Robust error handling: retry logic, graceful degradation, detailed logging
- Rate limiting on YouTube API calls
- Process queue to prevent overload when ingesting large channels

### R4: Storage & Database
**Option A (Recommended): Self-hosted PostgreSQL + pgvector on Hetzner**
- Direct Postgres (not full Supabase stack — too heavy for VPS)
- pgvector extension for future RAG/semantic search
- Estimated storage: ~2KB per video transcript average, 500 videos = ~1MB. Even 50,000 videos = ~100MB. Well within VPS capacity.
- Backup strategy: daily pg_dump to local + optional S3

**Option B: Supabase Free Tier (Fallback)**
- 500MB database, 1GB file storage, 5GB egress
- Sufficient for MVP (~50,000 transcripts easily)
- Risk: 500MB limit could be tight with embeddings (vectors are large)
- Pro plan: $25/mo if we outgrow free tier

**Decision: Start with Supabase free tier for speed. Migrate to self-hosted Postgres on Hetzner when we hit limits or want full control. Design the data layer to be Supabase-agnostic (use standard pg client, not Supabase JS client exclusively).**

### R5: Web UI
- Homepage: search bar + featured collections + recent transcripts
- Collection page (e.g. `/ufo`): grid of curated channels
- Creator page (`/creator/{slug}`): channel info + video list + search within channel
- Video page (`/creator/{slug}/{video_id}`): embed + summary + transcript + tags
- Markdown download button on every video page (downloads .md with title, summary, transcript, tags)
- Responsive design, clean branding ("Creator FAQ")
- Abuse protection: rate limiting on ingestion endpoint, IP throttling, CAPTCHA on public channel submission

### R6: CLI Tools
- `ingest --channel=URL` — add and ingest a channel
- `ingest --video=URL` — ingest a single video
- `ingest --collection=ufo` — ingest all channels in a collection
- `status` — show ingestion queue, processing status, error count
- `export --video=ID --format=md` — export transcript as markdown

### R7: Self-Hosted Deployment (Hetzner)
- Target: Morgan's existing Hetzner VPS or a dedicated one
- Stack: Node.js + Next.js (SSR) + PostgreSQL + nginx reverse proxy
- SSL via Let's Encrypt (certbot)
- PM2 or systemd for process management
- Step-by-step deployment guide required

### R8: Logging & Resilience
- Structured logging (JSON) for all ingestion steps
- Ingestion logs table in database (existing pattern)
- Graceful error handling: one failed video doesn't kill the batch
- Retry logic for transient failures (API rate limits, network errors)
- Health check endpoint

## Non-Requirements (Not in Scope)
- User authentication (public read-only site)
- Comment system
- Real-time processing (batch is fine)
- Mobile app
- Monetisation features

## Tech Stack
- **Frontend:** Next.js 16 + React 19 + Tailwind CSS 4
- **Backend:** Next.js API routes + standalone CLI scripts
- **Database:** Supabase (free tier) → self-hosted Postgres later
- **LLM:** Claude Sonnet 4.6 (text processing) + OpenAI Whisper (audio transcription)
- **Hosting:** Hetzner VPS (self-hosted) with nginx + SSL
- **Vector Search (future):** pgvector for RAG capabilities

## Constraints
- Claude Max subscription shared with Jarvis — be mindful of rate limits
- YouTube Data API quota: 10,000 units/day (free tier)
- OpenAI Whisper costs: ~$0.006/min of audio
- HoskSaid repo/deployment is READ-ONLY — no modifications permitted
