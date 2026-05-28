import { config } from 'dotenv';
config();

import { sql } from '../lib/db';
import { processTranscript } from '../lib/llm';

function getArg(name: string): string | null {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
}

async function enrichVideos() {
    const limit = parseInt(getArg('limit') || '10', 10);
    const videoIdArg = getArg('video');
    const forceUpdate = process.argv.includes('--force');

    console.log('🧠 tubechat Enrichment Script');
    console.log('-----------------------------');

    // Pending = completed videos whose transcript has no summary yet (or a specific video / all with --force)
    const pending = await sql<{ video_id: string; raw_text: string | null; title: string }[]>`
        SELECT t.video_id, t.raw_text, v.title
        FROM transcripts t
        JOIN videos v ON v.id = t.video_id AND v.status = 'completed'
        WHERE ${videoIdArg ? sql`t.video_id = ${videoIdArg}` : (forceUpdate ? sql`TRUE` : sql`t.summary IS NULL`)}
        LIMIT ${limit}
    `;

    if (pending.length === 0) {
        console.log('✅ No videos found needing enrichment.');
        return;
    }
    console.log(`🔍 Found ${pending.length} videos needing summaries.\n`);

    let successCount = 0;
    let failCount = 0;

    for (const t of pending) {
        const title = t.title || 'Unknown Title';
        console.log(`🎬 Enriching: ${title.slice(0, 50)}...`);
        console.log(`   📝 Transcript length: ${t.raw_text?.length || 0} chars`);

        if (!t.raw_text) {
            console.log('   ⚠️  No raw text available, skipping.');
            continue;
        }

        try {
            console.log('   🤖 Processing with LLM...');
            const start = Date.now();
            const processed = await processTranscript(t.raw_text);
            const duration = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`   ✅ Processed in ${duration}s. Summary: ${processed.summary.length} chars. Tags: ${processed.tags.join(', ')}`);

            await sql`
                UPDATE transcripts
                SET cleaned_text = ${processed.cleanedText}, summary = ${processed.summary}, updated_at = now()
                WHERE video_id = ${t.video_id}
            `;

            for (const tagName of processed.tags) {
                const [tag] = await sql<{ id: string }[]>`
                    INSERT INTO tags (name) VALUES (${tagName.toLowerCase()})
                    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id
                `;
                if (tag) {
                    await sql`INSERT INTO video_tags (video_id, tag_id) VALUES (${t.video_id}, ${tag.id}) ON CONFLICT DO NOTHING`;
                }
            }
            successCount++;
        } catch (err) {
            console.error(`   ❌ Failed:`, err);
            failCount++;
        }
        console.log('-----------------------------');
    }

    console.log(`\n📊 Enrichment Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
}

enrichVideos()
    .catch((e) => { console.error('Fatal error:', e); process.exitCode = 1; })
    .finally(() => sql.end());
