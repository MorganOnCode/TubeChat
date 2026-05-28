#!/usr/bin/env bash
# tubechat — one-cycle sync. Run from your LAPTOP (YouTube blocks the VPS IP).
# Opens the SSH tunnel to the VPS Postgres, runs ingest (metadata → transcript →
# clean/summary/tags) then generate-embeddings, then closes the tunnel.
# Safe to re-run: ingest skips completed videos, embeddings skip already-chunked.
#
#   npm run sync -- --collection=ufo             # full catch-up across all channels
#   npm run sync -- --collection=ufo --limit=3   # quick test (3 newest per channel)
#   ./scripts/sync.sh --port=5433 --ssh-alias=morganic
set -euo pipefail

COLLECTION="ufo"; LIMIT=""; SSH_ALIAS="morganic"; PORT="5433"; EMBED_BATCH="2000"
for a in "$@"; do case "$a" in
  --collection=*) COLLECTION="${a#*=}" ;;
  --limit=*)      LIMIT="${a#*=}" ;;
  --ssh-alias=*)  SSH_ALIAS="${a#*=}" ;;
  --port=*)       PORT="${a#*=}" ;;
  *) echo "unknown arg: $a" >&2; exit 1 ;;
esac; done

cd "$(dirname "$0")/.."   # repo root

dbcheck() {
  node --input-type=module -e "import 'dotenv/config'; import postgres from 'postgres'; const s=postgres(process.env.DATABASE_URL,{idle_timeout:2,connect_timeout:5}); const r=await s\`select count(*)::int videos,(select count(*)::int from transcript_chunks) chunks, max(published_at)::date latest from videos\`; console.log(JSON.stringify(r[0])); await s.end();"
}

# Keep the Mac awake for the whole run (no-op elsewhere).
command -v caffeinate >/dev/null 2>&1 && caffeinate -i -w "$$" &

# 1) SSH tunnel — reuse if one is already listening, else open (and own) it.
opened=0
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "→ reusing existing tunnel on :$PORT"
else
  echo "→ opening SSH tunnel :$PORT → $SSH_ALIAS"
  ssh -fNL "${PORT}:127.0.0.1:${PORT}" "$SSH_ALIAS"
  opened=1
fi
cleanup() {
  if [ "$opened" = 1 ]; then
    echo "→ closing tunnel :$PORT"
    pkill -f "${PORT}:127.0.0.1:${PORT}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 2) Wait for the DB to answer through the tunnel.
echo "→ waiting for DB on :$PORT ..."
for i in $(seq 1 10); do
  if before=$(dbcheck 2>/dev/null); then echo "  before: $before"; break; fi
  if [ "$i" = 10 ]; then echo "  ✗ DB unreachable — VPS down or ssh alias '$SSH_ALIAS' wrong?" >&2; exit 1; fi
  sleep 2
done

# 3) Ingest.
limarg=""; [ -n "$LIMIT" ] && limarg="--limit=$LIMIT"
echo "→ npm run ingest -- --collection=$COLLECTION $limarg"
npm run ingest -- --collection="$COLLECTION" $limarg

# 4) Enrich — backfill summaries/tags for any transcripts missing them
#    (e.g. videos ingested while the OpenAI key was down). Capped at 5 passes.
echo "→ npm run enrich"
elog="$(mktemp)"
for _ in 1 2 3 4 5; do
  npm run enrich -- --limit=200 | tee "$elog"
  if grep -q "No videos found needing enrichment" "$elog"; then break; fi
done
rm -f "$elog"

# 5) Embeddings — loop until a pass reports no new videos (capped at 5 passes).
echo "→ npm run generate-embeddings"
log="$(mktemp)"
for _ in 1 2 3 4 5; do
  npm run generate-embeddings -- --limit="$EMBED_BATCH" | tee "$log"
  if grep -q "New videos processed: 0" "$log"; then break; fi
done
rm -f "$log"

echo "→ after:  $(dbcheck || echo '(count failed)')"
echo "✓ sync complete"
