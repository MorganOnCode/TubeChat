# tubechat — Supabase/Vercel → self-hosted VPS migration

**What:** moved "OpenTube Creator Hub" (AI transcript search across UFO/UAP/NHI
YouTube channels) off Supabase + Vercel onto this VPS: self-hosted Postgres
(pgvector) + Docker, served via the existing Cloudflare tunnel under
**tubechat.video**.

**Status (2026-05-28):** Phases 0–5 complete — the app runs on the VPS at
`127.0.0.1:3002` with the full dataset restored. **Phase 4 (public DNS) is the
only step left** and is waiting on Porkbun→Cloudflare nameserver propagation.
See [Resume here](#resume-here).

---

## Sources & references

| Thing | Value |
|---|---|
| New git repo | https://github.com/MorganOnCode/TubeChat (branch `main`) |
| Old git repo (dead account) | github.com/morganic-jarvis-agent/opentube-creator-hub — account deleted; uploaded local checkout was the only surviving copy |
| Original uploaded copy (fallback) | `~/.tmp-uploads/opentube-hub` |
| Supabase project (source of backup) | `https://whccrxbknkxmgbwwdaqf.supabase.co` |
| Old hosting | Vercel — `creator-faq.vercel.app` |
| Playbook followed | `~/.tmp-uploads/self-hosting-playbook.md` (Next+Supabase+Vercel → this VPS) |
| Reference implementation | HoskSaid at `/opt/hosksaid` (templates copied + adapted) |
| Domain | `tubechat.video` (registered at Porkbun) |

## VPS infra facts (reused)

| Thing | Value |
|---|---|
| Project dir | `/opt/tubechat` (owned by `morganic`) |
| Web (loopback) | `127.0.0.1:3002` → container port 3000 |
| Postgres (loopback) | `127.0.0.1:5433` → container 5432 (pgvector/pgvector:pg16) |
| Cloudflare tunnel ID | `f54b9704-3347-47a2-8a45-975721dfda44` (shared; also serves cardano402.com, thehosksaid.com) |
| Tunnel config | `/etc/cloudflared/config.yml` (root) — restart: `sudo systemctl restart cloudflared` |
| Tunnel origin cert | `~/.cloudflared/cert.pem` (user `morganic`, NOT root/`/etc`) |
| Port map elsewhere | 3000 = cardano402, 3001 = hosksaid (pg 5432) |

## Secrets

All live in `/opt/tubechat/.env` on the VPS (gitignored — **not** in this repo).
Generated for self-hosting: `POSTGRES_DB/USER/PASSWORD`, `DATABASE_URL`, `CRON_SECRET`.
Carried over from the old repo (⚠️ **rotate after cutover** — they were exposed in
the deleted repo): `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_*`. `SUPADATA_API_KEY` is empty
(ingestion fallback; set if needed). `.env.example` documents the contract.

---

## Architecture: before → after

| Layer | Before (Vercel) | After (VPS) |
|---|---|---|
| DB | Supabase Postgres (`@supabase/supabase-js`) | self-hosted `pgvector/pgvector:pg16`, internal compose net |
| DB access | supabase client `.from()/.rpc()/.textSearch()` | `src/lib/db.ts` — `postgres` + `pgvector`, raw SQL, lazy client |
| Auth | Clerk (`@clerk/nextjs`, half-built/unused) | **removed** (public site, no login) |
| Host | Vercel serverless | Next 16 standalone in Docker, bound to `127.0.0.1:3002` |
| Public ingress | Vercel | Cloudflare tunnel → `localhost:3002` |
| Ingestion | Vercel/GH cron (disabled — YouTube blocks runners) | laptop-driven scripts over SSH tunnel |

Schema is a multi-channel superset of HoskSaid: adds `collections` +
`channel_collections`; same `channels/videos/transcripts/tags/video_tags/`
`transcript_chunks` + `match_transcript_chunks(vector(1536),float,int)` RPC.

---

## What was done, by phase

### Phase 0 — Assess
Confirmed Supabase used purely as Postgres (no Supabase auth/storage/realtime →
clean swap). Auth is Clerk (third-party, independent of DB). Ingestion scrapes
YouTube → datacenter IP blocked → must run from a residential IP (laptop).

### Phase 1 — Database schema → `docker/init-db.sql`
Mirrors `supabase/schema.sql` + migrations, verified against the live DB's actual
columns. Adds `CREATE EXTENSION pgcrypto, vector`; drops RLS; includes
`match_transcript_chunks` RPC, `updated_at` triggers, ivfflat embedding index,
the UFO collection seed, and an `error_reports` table (referenced in code but
never created in the live DB).

### Phase 2 — Code: drop Supabase + Clerk
- New `src/lib/db.ts`: lazy `postgres` client (Proxy so `next build` doesn't need
  `DATABASE_URL`), `pgvector` helpers, typed query helpers (`getVideos`,
  `getVideoByYoutubeId`, `searchVideos`, `tagSearchVideos`, `getVideosByIds`,
  `matchTranscriptChunks`, `getAllTags`, `submitErrorReport`). Date types parse to
  ISO strings (matches old PostgREST JSON; avoids `.split('T')` crashes).
- Rewrote to SQL: all pages (`app/**/page.tsx`), API routes
  (`api/videos`, `api/videos/[id]`, `api/search`, `api/ask`, `api/cron/ingest`),
  `src/lib/search-server.ts` (hybrid semantic+keyword+tag search), and the 3
  ingestion scripts.
- Removed Clerk: deleted `src/middleware.ts`, stripped `ClerkProvider`/buttons from
  `src/app/layout.tsx`; moved the `ssr:false` ChatWidget import into a client
  wrapper `src/components/ChatWidgetLoader.tsx` (Next 16 rule).
- `npm rm @clerk/nextjs @clerk/themes @supabase/supabase-js && npm i postgres pgvector`.
- `npx tsc --noEmit` clean.

### Phase 3 — Containerize
`Dockerfile` (multi-stage Next standalone + `yt-dlp`/`ffmpeg` for Whisper),
`docker-compose.prod.yml` (postgres loopback 5433 + web loopback 3002 + manual
`scheduler` profile), `next.config.ts` → `output: "standalone"`, `.dockerignore`.
Bring up: `docker compose -f docker-compose.prod.yml up -d --build`. Both
containers healthy; `/` returns 200.

### Phase 4 — Cloudflare tunnel + DNS  ← **IN PROGRESS** (see Resume)

### Phase 5 — Data restore
Backed up the live Supabase DB via `scripts/backup-supabase.mjs` (PostgREST +
service-role key over HTTPS — IPv4-safe; per-table page sizes avoid statement
timeouts) to `backups/supabase-2026-05-28/` (gzipped NDJSON + schema + manifest).
Restored into the VPS Postgres via `scripts/restore-from-backup.mjs`
(`unnest($n::type[])` batch inserts incl. `::vector[]` and `::jsonb[]`).
**Verified row counts match exactly:**

| table | rows | | table | rows |
|---|---|---|---|---|
| channels | 12 | | video_tags | 22,279 |
| collections | 1 | | ingestion_logs | 10,302 |
| channel_collections | 12 | | transcript_chunks | 225,664 |
| videos | 4,196 | | (embeddings) | 1536-dim verified |
| transcripts | 4,169 | | tags | 8,818 |

Verified end-to-end: `/api/videos` real data + channel joins, `/api/search` FTS,
pgvector `match_transcript_chunks` returns matches, `/channels` and `/videos` render.

---

## Resume here

**Phase 4 — make tubechat.video public.** Paused ~06:20 UTC 2026-05-28 waiting on
Porkbun→Cloudflare NS propagation (up to ~2h).

**User steps (dashboard):**
1. Cloudflare → Add site `tubechat.video` (same account as the tunnel) → copy its 2 nameservers.
2. Porkbun → tubechat.video → Authoritative Nameservers → replace the 4 Porkbun NS with Cloudflare's 2.
3. Wait until Cloudflare shows the zone **Active**. Check: `dig +short NS tubechat.video` returns `*.ns.cloudflare.com`.

**Then (on the VPS, as `morganic` unless noted):**
```bash
# 1. back up the origin cert, then authorize tubechat.video (opens a browser URL)
cp ~/.cloudflared/cert.pem ~/.cloudflared/cert.pem.bak-pre-tubechat
cloudflared tunnel login          # pick tubechat.video; existing routes keep working

# 2. add ingress (sudo) ABOVE the http_status:404 catch-all in /etc/cloudflared/config.yml:
#      - hostname: tubechat.video
#        service: http://localhost:3002
#      - hostname: www.tubechat.video
#        service: http://localhost:3002
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak-pre-tubechat
sudo cloudflared --config /etc/cloudflared/config.yml ingress validate
sudo systemctl restart cloudflared

# 3. route DNS (overwrites the stale 44.227.x apex A records)
cloudflared tunnel route dns -f f54b9704-3347-47a2-8a45-975721dfda44 tubechat.video
cloudflared tunnel route dns -f f54b9704-3347-47a2-8a45-975721dfda44 www.tubechat.video

# 4. verify
curl -I https://tubechat.video
```

---

## Operating the stack

```bash
cd /opt/tubechat

# status / logs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f web

# re-apply schema by hand (idempotent)
docker compose -f docker-compose.prod.yml exec -T postgres psql -U tubechat -d tubechat < docker/init-db.sql

# back up the (now-VPS) DB again — repoint scripts/backup-supabase.mjs if needed
node scripts/backup-supabase.mjs

# restore from a backup dir (truncates + reloads, FK-safe)
node scripts/restore-from-backup.mjs
```

### Ingestion (run from the LAPTOP — YouTube blocks the VPS IP)
```bash
# laptop: fresh clone + deps
git clone https://github.com/MorganOnCode/TubeChat && cd TubeChat && npm install
# laptop .env: DATABASE_URL=postgres://tubechat:<POSTGRES_PASSWORD>@localhost:5433/tubechat  (+ OPENAI/YOUTUBE/SUPADATA keys)
ssh -fNL 5433:127.0.0.1:5433 morganic      # tunnel to VPS Postgres
npm run ingest -- --collection=ufo --limit=5
npm run enrich -- --limit=10
npm run generate-embeddings -- --limit=10
pkill -f "ssh -fNL 5433"
```

---

## Decisions & gotchas

- **Clerk removed** (user's call): auth was half-built and unused; site is public.
- **Legacy cron scripts retired**: `src/scripts/cron-ingest.ts` (budget-aware) +
  `cron-enrich-embed.ts` still import the old Supabase client and are excluded from
  the type-check (`tsconfig.json` → `exclude`). Superseded by the 3 canonical
  scripts; their code remains in git history if the Supadata-budget logic is wanted.
- **Backup not via `pg_dump`**: Supabase free tier's direct DB is IPv6-only and the
  pooler breaks pg_dump; used the PostgREST/service-role JSON pump instead.
- **Restore casts**: postgres bulk insert of `vector`/`jsonb`/`timestamptz` from text
  needs explicit `unnest(... ::type[])` casts.
- **Next 16**: `next/dynamic` with `ssr:false` must live in a Client Component.
- **Lazy DB client**: required so `next build` (no `DATABASE_URL`) doesn't crash;
  DB-querying pages catch errors and prerender empty, then ISR fills in.

## Outstanding after DNS
- One real laptop ingest to confirm the pipeline end-to-end.
- Rotate the carried-over API keys.
- Cancel the Supabase subscription + delete the Vercel project.
