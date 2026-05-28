#!/usr/bin/env node
// Parity check: VPS Postgres vs LIVE Supabase. Confirms the migration captured
// everything before the Supabase subscription is cancelled.
// Run from the VPS: node scripts/parity-check.mjs
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const here = new URL('..', import.meta.url).pathname;
const envText = await readFile(here + '.env', 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL || env.DATABASE_URL;
const sql = postgres(DATABASE_URL, { max: 2, prepare: false });

const TABLES = ['channels', 'collections', 'channel_collections', 'videos',
  'transcripts', 'tags', 'video_tags', 'ingestion_logs', 'transcript_chunks'];

async function sbCount(t) {
  const res = await fetch(`${SB}/${t}?select=*&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' },
  });
  return Number((res.headers.get('content-range') || '/0').split('/')[1] || 0);
}
async function pgCount(t) {
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM ${sql(t)}`;
  return c;
}

console.log(`Comparing VPS (${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}) vs Supabase (${env.NEXT_PUBLIC_SUPABASE_URL})\n`);
console.log('table'.padEnd(22), 'supabase'.padStart(10), 'vps'.padStart(10), '  status');
let allMatch = true;
for (const t of TABLES) {
  const [sb, pg] = await Promise.all([sbCount(t), pgCount(t)]);
  const ok = sb === pg;
  if (!ok) allMatch = false;
  console.log(t.padEnd(22), String(sb).padStart(10), String(pg).padStart(10), ok ? '  ✓ match' : `  ✗ DIFF (${pg - sb})`);
}

// embedding dimension parity
const sbEmbRes = await fetch(`${SB}/transcript_chunks?select=embedding&limit=1`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const sbEmb = (await sbEmbRes.json())[0]?.embedding;
const sbDims = typeof sbEmb === 'string' ? sbEmb.split(',').length : (Array.isArray(sbEmb) ? sbEmb.length : 0);
const [{ dims: pgDims }] = await sql`SELECT vector_dims(embedding) AS dims FROM transcript_chunks WHERE embedding IS NOT NULL LIMIT 1`;
console.log(`\nembedding dims:  supabase=${sbDims}  vps=${pgDims}  ${sbDims === pgDims ? '✓' : '✗'}`);

// spot-check: 3 random videos from Supabase exist in VPS by youtube_id
const sample = await (await fetch(`${SB}/videos?select=youtube_id&limit=3&order=created_at.desc`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
})).json();
let spotOk = true;
for (const v of sample) {
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM videos WHERE youtube_id = ${v.youtube_id}`;
  if (c !== 1) spotOk = false;
  console.log(`spot-check ${v.youtube_id}: ${c === 1 ? '✓ present in VPS' : '✗ MISSING'}`);
}

await sql.end();
console.log(`\n${allMatch && sbDims === pgDims && spotOk ? '✅ 100% PARITY — safe to cancel Supabase.' : '❌ MISMATCH — do NOT cancel Supabase yet.'}`);
process.exit(allMatch && sbDims === pgDims && spotOk ? 0 : 1);
