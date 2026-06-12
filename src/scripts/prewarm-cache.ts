/**
 * Pre-warm the response cache for curated/clickable questions (feat/search-efficiency).
 * Drives the live /api/ask endpoint for each question in CURATED_QUESTIONS; the
 * route's own write-through populates query_cache, then we flag those rows
 * `curated = true` so a click from /digest serves free + instant (zero LLM).
 *
 * Run after a deploy, and after a corpus re-embed + corpus_version bump:
 *   PREWARM_BASE_URL=http://127.0.0.1:3002 npx tsx src/scripts/prewarm-cache.ts
 * (defaults to the prod web port 3002; use http://localhost:3000 in dev.)
 */
import { config } from 'dotenv';
config();

import { sql, getCorpusVersion } from '../lib/db';
import { normalizeQuestion, scopeKey, cacheKey } from '../lib/retrieval';
import { CURATED_QUESTIONS } from '../lib/curated-questions';

const BASE_URL = process.env.PREWARM_BASE_URL || 'http://127.0.0.1:3002';

/** POST the question and drain the NDJSON stream so the route runs to completion. */
async function warm(question: string): Promise<{ ok: boolean; cached: boolean; mode: string }> {
    const res = await fetch(`${BASE_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode: 'answer' }),
    });
    if (!res.ok || !res.body) return { ok: false, cached: false, mode: '' };

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
    }
    let cached = false;
    let mode = 'answer';
    for (const line of buf.trim().split('\n')) {
        if (!line.trim()) continue;
        try {
            const ev = JSON.parse(line);
            if (ev.type === 'done') { cached = !!ev.cached; mode = ev.mode ?? 'answer'; }
        } catch { /* ignore partial line */ }
    }
    return { ok: true, cached, mode };
}

/** Flag the cache row curated. Retries briefly — the route's write-through is
 *  fire-and-forget after the stream closes, so the row may land a beat later. */
async function markCurated(question: string, corpusVersion: string): Promise<boolean> {
    const key = cacheKey(corpusVersion, scopeKey({}), 'answer', normalizeQuestion(question));
    for (let attempt = 0; attempt < 6; attempt++) {
        const r = await sql`UPDATE query_cache SET curated = true WHERE cache_key = ${key}`;
        if (r.count > 0) return true;
        await new Promise((res) => setTimeout(res, 400));
    }
    return false;
}

async function prewarm() {
    const corpusVersion = await getCorpusVersion();
    console.log(`🔥 Pre-warming ${CURATED_QUESTIONS.length} curated questions via ${BASE_URL} (corpus v${corpusVersion})...`);

    let warmed = 0;
    let fromCache = 0;
    for (const q of CURATED_QUESTIONS) {
        try {
            const r = await warm(q);
            if (!r.ok) { console.error(`  ✗ request failed: ${q.slice(0, 60)}`); continue; }
            if (r.cached) fromCache++;
            const flagged = await markCurated(q, corpusVersion);
            warmed++;
            console.log(`  ✓ ${r.cached ? '(cached)' : '(fresh) '} ${flagged ? '★' : ' '} ${q.slice(0, 64)}`);
        } catch (e) {
            console.error(`  ✗ error: ${q.slice(0, 60)}`, e);
        }
    }
    console.log(`✅ Pre-warm done. ${warmed}/${CURATED_QUESTIONS.length} warmed (${fromCache} already cached).`);
}

prewarm()
    .catch((e) => { console.error('Fatal error:', e); process.exitCode = 1; })
    .finally(() => sql.end());
