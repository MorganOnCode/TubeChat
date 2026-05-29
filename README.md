# TubeChat (OpenTube)

AI-powered transcript search across curated YouTube creator collections (currently UFO / UAP / NHI research). Full-text + semantic search, AI summaries, topic tagging, and a RAG "Ask" chat over the corpus.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (design tokens in `src/app/globals.css`)
- **Self-hosted Postgres 16 + pgvector** as the single system of record (no external BaaS)
- **OpenAI** — `text-embedding-3-small` embeddings + `gpt-4o-mini` RAG
- **Anthropic** — transcript cleaning / summaries (ingestion-time)
- **Docker Compose** for production (`web` + `postgres`), fronted by a Cloudflare tunnel

> Migrated off Supabase/Vercel to a self-hosted VPS — see `MIGRATION_RUNBOOK.md`. The app talks to Postgres directly via `DATABASE_URL` (`src/lib/db.ts`); there is no Supabase dependency.

## Architecture

```
YouTube ──ingest──▶ Postgres (pgvector) ◀──reads── Next.js app ──▶ users
          enrich        ▲                            (SSR + API routes)
          embeddings    │
                   self-hosted on VPS
```

- **App / API** — `src/app/**` (pages + `api/` routes for search, ask, videos, cron)
- **DB adapter** — `src/lib/db.ts` (postgres.js + pgvector)
- **Ingestion pipeline** — `src/scripts/{ingest,enrich,generate-embeddings}.ts`, run from a residential IP (laptop) over an SSH tunnel because the VPS datacenter IP is blocked by YouTube
- **Schema / migrations** — `supabase/` (SQL migrations; the directory name is historical)

## Local development

```bash
cp .env.example .env   # fill in keys + DATABASE_URL
npm install
npm run dev            # http://localhost:3000
```

## Production (VPS)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- `web` is bound to `127.0.0.1:3002` (Cloudflare tunnel terminates public traffic).
- `postgres` is bound to `127.0.0.1:5433` so laptop ingestion can tunnel in.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run ingest` | Pull new videos + transcripts into Postgres |
| `npm run enrich` | Clean transcripts / generate summaries (Anthropic) |
| `npm run generate-embeddings` | Backfill pgvector embeddings (OpenAI) |
| `npm run sync` | One-cycle laptop sync: tunnel → ingest → enrich → embeddings |

Disaster recovery: `scripts/restore-from-backup.mjs` restores the gzipped-NDJSON export under `backups/` into Postgres.
