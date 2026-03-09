# Creator FAQ — Roadmap

## Milestone 1: MVP — Multi-Channel Transcript Engine ⬅️ IN PROGRESS

### Phase 1: Project Setup & Database
**Goal:** Fork codebase, set up new Supabase instance, update schema for multi-channel
- Copy HoskSaid codebase to `projects/creator-faq/`
- Rename project, update package.json, branding
- Create new Supabase project (separate from HoskSaid)
- Update schema: add `slug` to channels, add `collections` table, add `channel_collections` junction table
- Update .env with new credentials
- Verify existing ingest script works against new DB
**Success:** Can run `ingest --channel=ID` against new database

### Phase 2: Swap LLM to Claude Sonnet
**Goal:** Replace GPT-4o-mini with Claude for transcript processing, keep Whisper intact
- Install `@anthropic-ai/sdk` 
- Rewrite `src/lib/llm.ts` to use Claude Sonnet 4.6
- Keep `src/lib/whisper.ts` untouched (OpenAI Whisper stays)
- Update prompts for Claude's format
- Test: ingest a video, verify clean transcript + summary + tags quality matches or exceeds GPT
**Success:** Full pipeline works with Claude for text, Whisper for audio fallback

### Phase 3: Multi-Channel Web UI
**Goal:** Creator pages, collection pages, channel input
- Build `/creator/{slug}` dynamic route — channel info + video grid + search
- Build `/ufo` collection page — curated channel grid (hardcoded initially)
- Build channel submission form on homepage (URL input → triggers ingestion)
- Abuse protection: rate limiting middleware, IP throttle on submit endpoint
- Update homepage: search + featured collections + recent videos
**Success:** Can browse multiple channels, submit new ones, view per-creator pages

### Phase 4: Markdown Download & Polish
**Goal:** Export functionality + branding
- Add download button on every video page → generates .md file (title, URL, summary, tags, full transcript)
- Client-side download (no server needed — generate blob from page data)
- New branding: "Creator FAQ" logo, favicon, colors, footer
- Responsive design pass
- Meta tags (OG, Twitter cards) for sharing
**Success:** Users can download any transcript as markdown, site looks professional

### Phase 5: CLI Tools & Resilience  
**Goal:** Robust CLI + error handling + logging
- Refactor ingest script: support `--channel=URL` (parse channel ID from URL), `--collection=name`
- Add `status` command: show queue depth, processing count, error count
- Add `export` command: `--video=ID --format=md`
- Process queue: prevent concurrent overload (max 3 parallel ingestions)
- Retry logic: exponential backoff on API failures
- Health check endpoint: `/api/health`
**Success:** CLI tools work reliably, system recovers from transient failures

### Phase 6: Hetzner Deployment
**Goal:** Self-hosted on VPS with SSL
- Choose target: Jarvis VPS (116.203.47.79) or Gilfoyle (89.167.83.179) or new server
- Install PostgreSQL + pgvector (or continue with Supabase remote)
- nginx reverse proxy config
- SSL via Let's Encrypt (certbot)
- PM2 or systemd service for Next.js
- Deployment script
- Step-by-step guide for Morgan
**Success:** Site live on a domain with HTTPS, auto-restarts on crash

## Milestone 2: RAG & Semantic Search (Future)
- Embed transcripts with pgvector
- Semantic search across all transcripts
- "Ask {Creator}" chatbot interface
- Cross-creator topic comparison

## Milestone 3: Scale & Community (Future)
- User accounts for saving/bookmarking
- Community-submitted channels
- API for third-party access
- Multiple collections (crypto, AI, science, etc.)
