#!/usr/bin/env node
// Restore the gzipped-NDJSON Supabase backup into the self-hosted Postgres.
// Uses unnest(...::type[]) batch inserts so text/uuid/int/timestamptz/jsonb/vector
// all parse cleanly from their backed-up text form.
//
// Usage:
//   node scripts/restore-from-backup.mjs                 # truncate + full restore
//   node scripts/restore-from-backup.mjs --no-truncate
//   node scripts/restore-from-backup.mjs --table=transcript_chunks --limit=2000
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import postgres from 'postgres';

const args = process.argv.slice(2);
const noTruncate = args.includes('--no-truncate');
const onlyTable = args.find((a) => a.startsWith('--table='))?.split('=')[1];
const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1];
const ROW_LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity;

const here = path.dirname(new URL(import.meta.url).pathname);
const envText = await readFile(path.join(here, '..', '.env'), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set (env or .env)');

const BACKUP_DIR = path.join(here, '..', 'backups', 'supabase-2026-05-28');
const sql = postgres(DATABASE_URL, { max: 4, prepare: false, idle_timeout: 20 });

// column -> Postgres type for the unnest cast
const TYPE = {
  id: 'uuid', channel_id: 'uuid', video_id: 'uuid', tag_id: 'uuid', collection_id: 'uuid',
  youtube_id: 'text', name: 'text', slug: 'text', description: 'text', thumbnail_url: 'text',
  title: 'text', raw_text: 'text', cleaned_text: 'text', summary: 'text', source: 'text',
  processing_status: 'text', status: 'text', video_type: 'text', content: 'text', step: 'text',
  subscriber_count: 'int', video_count: 'int', duration_seconds: 'int', view_count: 'int',
  start_time: 'int', end_time: 'int',
  created_at: 'timestamptz', updated_at: 'timestamptz', published_at: 'timestamptz', added_at: 'timestamptz',
  details: 'jsonb', embedding: 'vector',
};

// FK-safe load order; batch sizes tuned to param payload size.
const TABLES = [
  { name: 'channels', cols: ['id','youtube_id','name','slug','description','thumbnail_url','subscriber_count','video_count','created_at','updated_at'], batch: 1000 },
  { name: 'collections', cols: ['id','name','slug','description','created_at'], batch: 1000 },
  { name: 'channel_collections', cols: ['channel_id','collection_id','added_at'], batch: 1000 },
  { name: 'videos', cols: ['id','channel_id','youtube_id','title','description','published_at','duration_seconds','thumbnail_url','view_count','video_type','status','created_at','updated_at'], batch: 500 },
  { name: 'transcripts', cols: ['id','video_id','raw_text','cleaned_text','summary','source','processing_status','created_at','updated_at'], batch: 100 },
  { name: 'tags', cols: ['id','name','created_at'], batch: 2000 },
  { name: 'video_tags', cols: ['video_id','tag_id'], batch: 2000 },
  { name: 'ingestion_logs', cols: ['id','video_id','step','status','details','created_at'], batch: 1000 },
  { name: 'transcript_chunks', cols: ['id','video_id','content','start_time','end_time','embedding','created_at'], batch: 500 },
];

function cell(col, val) {
  if (val === undefined || val === null) return null;
  if (TYPE[col] === 'jsonb') return JSON.stringify(val);
  return val; // text/int/timestamptz/uuid/vector all already text or number
}

// Column names + types come from the fixed maps above (never user input), so
// building the SQL string and passing arrays positionally via sql.unsafe is safe.
async function insertBatch(t, batch) {
  const arrays = t.cols.map((c) => batch.map((r) => cell(c, r[c])));
  const colNames = t.cols.join(', ');
  const unnestArgs = t.cols.map((c, i) => `$${i + 1}::${TYPE[c]}[]`).join(', ');
  const query = `INSERT INTO ${t.name} (${colNames}) SELECT * FROM unnest(${unnestArgs}) ON CONFLICT DO NOTHING`;
  await sql.unsafe(query, arrays);
}

async function* readRows(file) {
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}

async function loadTable(t) {
  const file = path.join(BACKUP_DIR, `${t.name}.ndjson.gz`);
  let batch = [];
  let total = 0;
  const flush = async () => {
    if (!batch.length) return;
    await insertBatch(t, batch);
    total += batch.length;
    process.stdout.write(`\r  ${t.name}: ${total}   `);
    batch = [];
  };
  for await (const row of readRows(file)) {
    if (total + batch.length >= ROW_LIMIT) break;
    batch.push(row);
    if (batch.length >= t.batch) await flush();
  }
  await flush();
  process.stdout.write(`\r  ${t.name}: ${total}  done\n`);
  return total;
}

const targets = onlyTable ? TABLES.filter((t) => t.name === onlyTable) : TABLES;

if (!noTruncate && !onlyTable) {
  console.log('Truncating target tables...');
  await sql`TRUNCATE channel_collections, transcript_chunks, video_tags, ingestion_logs, transcripts, videos, tags, collections, channels RESTART IDENTITY CASCADE`;
}

console.log(`Restoring into ${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}\n`);
const results = [];
for (const t of targets) {
  const n = await loadTable(t);
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM ${sql(t.name)}`;
  results.push({ table: t.name, loaded: n, inDb: count });
}

console.log('\nDone. Row counts in DB:');
for (const r of results) console.log(`  ${r.table.padEnd(22)} loaded=${r.loaded}  total_in_db=${r.inDb}`);
await sql.end();
