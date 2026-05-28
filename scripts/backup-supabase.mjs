#!/usr/bin/env node
// Standalone Supabase backup: dumps every table to gzipped NDJSON via PostgREST.
// No SDK, no Postgres password needed — uses the service-role key over HTTPS (IPv4-safe).
// Usage: node scripts/backup-supabase.mjs
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';

// --- load .env (simple parser, no deps) ---
const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) throw new Error('Missing SUPABASE_URL / SERVICE_ROLE_KEY in .env');

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Tables to back up. `key` = keyset column (single PK) for efficient paging.
// Junction tables have no single id → offset paging via `order` only.
// `page` overrides default page size for heavy-row tables (large text / embeddings)
// to stay under Supabase's per-statement timeout.
const TABLES = [
  { name: 'channels', key: 'id', order: 'id.asc' },
  { name: 'collections', key: 'id', order: 'id.asc' },
  { name: 'channel_collections', key: null, order: 'channel_id.asc,collection_id.asc' },
  { name: 'videos', key: 'id', order: 'id.asc' },
  { name: 'transcripts', key: 'id', order: 'id.asc', page: 100 },
  { name: 'tags', key: 'id', order: 'id.asc' },
  { name: 'video_tags', key: null, order: 'video_id.asc,tag_id.asc' },
  { name: 'ingestion_logs', key: 'id', order: 'id.asc', page: 500 },
  { name: 'transcript_chunks', key: 'id', order: 'id.asc', page: 500 },
];

const DEFAULT_PAGE = 1000;

async function fetchJson(url, extraHeaders = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { ...HEADERS, ...extraHeaders } });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return res;
    } catch (e) {
      if (attempt === 4) throw e;
      const wait = 500 * attempt;
      console.warn(`  retry ${attempt} after error: ${e.message} (waiting ${wait}ms)`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

async function countTable(name) {
  const res = await fetchJson(`${BASE}/${name}?select=*&limit=1`, { Prefer: 'count=exact', Range: '0-0' });
  const cr = res.headers.get('content-range') || '/0';
  return Number(cr.split('/')[1] || 0);
}

async function dumpTable(t, outDir) {
  const expected = await countTable(t.name);
  const file = path.join(outDir, `${t.name}.ndjson.gz`);
  const gzip = createGzip();
  const out = createWriteStream(file);
  const done = pipeline(gzip, out); // resolves when fully flushed

  const page = t.page || DEFAULT_PAGE;
  let written = 0;
  let lastKey = null;

  while (true) {
    let url;
    if (t.key) {
      // keyset pagination
      const filter = lastKey !== null ? `&${t.key}=gt.${encodeURIComponent(lastKey)}` : '';
      url = `${BASE}/${t.name}?select=*&order=${t.order}&limit=${page}${filter}`;
    } else {
      // offset pagination
      url = `${BASE}/${t.name}?select=*&order=${t.order}&limit=${page}&offset=${written}`;
    }
    const res = await fetchJson(url);
    const rows = await res.json();
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!gzip.write(JSON.stringify(row) + '\n')) {
        await new Promise(r => gzip.once('drain', r));
      }
    }
    written += rows.length;
    if (t.key) lastKey = rows[rows.length - 1][t.key];
    process.stdout.write(`\r  ${t.name}: ${written}/${expected}   `);
    if (rows.length < page) break;
  }

  gzip.end();
  await done;
  process.stdout.write(`\r  ${t.name}: ${written}/${expected}  done\n`);
  return { table: t.name, expected, written };
}

const stamp = new Date().toISOString().slice(0, 10);
const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'backups', `supabase-${stamp}`);
await mkdir(outDir, { recursive: true });
console.log(`Backup dir: ${outDir}\nSource: ${env.NEXT_PUBLIC_SUPABASE_URL}\n`);

const results = [];
for (const t of TABLES) {
  results.push(await dumpTable(t, outDir));
}

const manifest = {
  source: env.NEXT_PUBLIC_SUPABASE_URL,
  created_at: new Date().toISOString(),
  format: 'gzipped NDJSON, one row per line',
  tables: results,
  note: 'error_reports omitted — referenced in code but never created in the live DB.',
};
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const mismatches = results.filter(r => r.written !== r.expected);
console.log('\nManifest written. Summary:');
for (const r of results) console.log(`  ${r.table.padEnd(22)} ${r.written}/${r.expected} ${r.written === r.expected ? 'OK' : 'MISMATCH'}`);
if (mismatches.length) {
  console.error(`\nWARNING: ${mismatches.length} table(s) row-count mismatch.`);
  process.exit(1);
}
console.log('\nAll tables backed up with matching row counts.');
