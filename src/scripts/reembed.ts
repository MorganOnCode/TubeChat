/**
 * Re-embed the whole corpus into the 512-dim shadow column `embedding_v2`
 * (feat/search-efficiency), with the contextual "{channel} — {title} (date):"
 * prefix. The live 1536 `embedding` column is untouched, so this is non-destructive
 * and the ask box keeps serving on 1536 until the EMBED_DIMS=512 cutover.
 *
 * Batched (OpenAI accepts an input array) so 225k chunks take minutes, not hours.
 * Resumable: only fills rows where embedding_v2 IS NULL, so it can be re-run after
 * an interruption.
 *
 *   npx tsx src/scripts/reembed.ts                 # re-embed all missing
 *   npx tsx src/scripts/reembed.ts --limit=2000    # sample (e.g. for an A/B)
 *   npx tsx src/scripts/reembed.ts --batch=200     # tune batch size
 *   npx tsx src/scripts/reembed.ts --bump-corpus   # bump corpus_version (run at cutover)
 */
import { config } from 'dotenv';
config();

import { sql } from '../lib/db';
import { generateEmbeddingsBatch } from '../lib/llm';
import { buildEmbedText } from '../lib/retrieval';

const DIMS = 512;

function getArg(name: string): string | null {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
}
function hasFlag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

interface ChunkRow {
    id: string;
    content: string;
    channel_name: string | null;
    title: string | null;
    published_at: string | null;
}

async function reembed() {
    const batchSize = parseInt(getArg('batch') || '200', 10);
    const limit = getArg('limit') ? parseInt(getArg('limit')!, 10) : null;

    const [{ total }] = await sql<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM transcript_chunks WHERE embedding_v2 IS NULL
    `;
    const target = limit != null ? Math.min(limit, total) : total;
    console.log(`🧠 Re-embedding ${target} of ${total} chunks at ${DIMS} dims (batch ${batchSize})...`);

    let done = 0;
    let failures = 0;

    while (done < target) {
        const take = Math.min(batchSize, target - done);
        // Pull the next page of un-embedded chunks with their video/channel meta.
        const rows = await sql<ChunkRow[]>`
            SELECT tc.id, tc.content,
                   c.name AS channel_name, v.title, v.published_at
            FROM transcript_chunks tc
            JOIN videos v   ON v.id = tc.video_id
            LEFT JOIN channels c ON c.id = v.channel_id
            WHERE tc.embedding_v2 IS NULL
            ORDER BY tc.id
            LIMIT ${take}
        `;
        if (rows.length === 0) break;

        const texts = rows.map((r) =>
            buildEmbedText({ channel: r.channel_name, title: r.title, publishedAt: r.published_at }, r.content),
        );

        let vectors: number[][];
        try {
            vectors = await generateEmbeddingsBatch(texts, DIMS);
        } catch (e) {
            console.error(`   ⚠️ batch embed failed (${rows.length} rows), retrying once:`, e);
            try {
                vectors = await generateEmbeddingsBatch(texts, DIMS);
            } catch (e2) {
                console.error('   ❌ batch failed twice — skipping this page:', e2);
                failures += rows.length;
                // Avoid an infinite loop on a poison page: tombstone with a zero-norm
                // would corrupt search, so instead break and let a re-run resume.
                break;
            }
        }

        // Write each vector back. One UPDATE per row, wrapped in a single transaction.
        await sql.begin(async (tx) => {
            for (let i = 0; i < rows.length; i++) {
                const vec = vectors[i];
                if (!vec || !vec.length) continue;
                await tx`
                    UPDATE transcript_chunks
                    SET embedding_v2 = ${`[${vec.join(',')}]`}::vector
                    WHERE id = ${rows[i].id}
                `;
            }
        });

        done += rows.length;
        if (done % (batchSize * 5) < batchSize || done >= target) {
            console.log(`   …${done}/${target} (${Math.round((done / target) * 100)}%)`);
        }
    }

    console.log(`✅ Re-embed complete. Filled ${done} chunks${failures ? `, ${failures} skipped` : ''}.`);

    if (hasFlag('bump-corpus')) {
        const [{ value }] = await sql<{ value: string }[]>`
            INSERT INTO app_meta (key, value) VALUES ('corpus_version', '2')
            ON CONFLICT (key) DO UPDATE SET value = (app_meta.value::int + 1)::text, updated_at = now()
            RETURNING value
        `;
        console.log(`🔀 corpus_version bumped to ${value} (invalidates the response cache).`);
    } else {
        console.log('ℹ️  corpus_version NOT bumped. Run with --bump-corpus at cutover (after EMBED_DIMS=512) to invalidate stale cache.');
    }
}

reembed()
    .catch((e) => { console.error('Fatal error:', e); process.exitCode = 1; })
    .finally(() => sql.end());
