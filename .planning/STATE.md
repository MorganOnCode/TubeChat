# OpenTube Creator Hub — State

## Current Phase
Phase 7: Auth & BYOK

## Phase Status
- Phase 1: COMPLETE — Project setup, Supabase schema, multi-channel support
- Phase 2: COMPLETE — LLM swap (OpenAI GPT-4o-mini, not Claude — no Anthropic API key)
- Phase 3: COMPLETE — Multi-channel UI, channels page, video pages, search
- Phase 4: COMPLETE — RAG Ask page, channel detail pages, topic tracking pages
- Phase 5: COMPLETE — Ingestion pipeline (yt-dlp + Supadata fallback), VPS cron scripts
- Phase 6: COMPLETE — Vercel deployment, floating chat widget, channel thumbnails
- Phase 7: IN PROGRESS
  - [ ] Set up Clerk auth (sign-in, sign-up, middleware, user context)
  - [ ] Rate limiting for anonymous vs authenticated users
  - [ ] User settings table in Supabase (linked to Clerk user ID)
  - [ ] BYOK: bring your own API key settings page
  - [ ] BYOK: route chat through user's key when available
  - [ ] Data export API (JSON/CSV/Markdown)
  - [ ] Export download buttons on channel + search pages
