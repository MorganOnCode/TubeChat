#!/usr/bin/env npx tsx
/**
 * Cron script: Enrich + Embed pipeline
 * 
 * Runs on VPS (no YouTube access needed — works on already-ingested videos).
 * 1. Finds videos with transcripts but no summary → runs LLM enrichment
 * 2. Finds videos with transcripts but no embeddings → generates chunks + embeddings
 * 
 * Usage:
 *   npx tsx src/scripts/cron-enrich-embed.ts [--limit=10] [--enrich-only] [--embed-only]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { processTranscript, generateEmbedding } from '../lib/llm';

config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const getArg = (name: string): string | null => {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

function splitText(text: string): string[] {
    const chunks: string[] = [];
    const normalized = text.replace(/\s+/g, ' ').trim();
    let start = 0;
    while (start < normalized.length) {
        let end = start + CHUNK_SIZE;
        if (end < normalized.length) {
            const boundary = normalized.slice(start, end + 50).lastIndexOf('.');
            if (boundary > CHUNK_SIZE * 0.8) end = start + boundary + 1;
        }
        chunks.push(normalized.slice(start, end).trim());
        start = end - CHUNK_OVERLAP;
    }
    return chunks;
}

async function enrichBatch(limit: number): Promise<number> {
    console.log(`\n🧠 Enrichment: Finding videos needing summaries (limit ${limit})...`);

    const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('video_id, raw_text, video:videos(title)')
        .is('summary', null)
        .not('raw_text', 'is', null)
        .limit(limit);

    if (error || !transcripts || transcripts.length === 0) {
        console.log('   ✅ No videos need enrichment.');
        return 0;
    }

    console.log(`   Found ${transcripts.length} videos to enrich.\n`);
    let success = 0;

    for (const t of transcripts) {
        const title = (t as any).video?.title || 'Unknown';
        console.log(`   🎬 ${title.slice(0, 60)}...`);

        if (!t.raw_text || t.raw_text.length < 50) {
            console.log('      ⚠️ Text too short, skipping.');
            continue;
        }

        try {
            const start = Date.now();
            const processed = await processTranscript(t.raw_text);
            const duration = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`      ✅ ${duration}s | Summary: ${processed.summary.length}c | Tags: ${processed.tags.join(', ')}`);

            await supabase.from('transcripts').update({
                cleaned_text: processed.cleanedText,
                summary: processed.summary,
            }).eq('video_id', t.video_id);

            for (const tagName of processed.tags) {
                const { data: tag } = await supabase
                    .from('tags')
                    .upsert({ name: tagName.toLowerCase() }, { onConflict: 'name' })
                    .select().single();
                if (tag) {
                    await supabase.from('video_tags').upsert(
                        { video_id: t.video_id, tag_id: tag.id },
                        { onConflict: 'video_id,tag_id' }
                    );
                }
            }

            success++;
        } catch (err) {
            console.error(`      ❌ Failed:`, err);
        }
    }

    return success;
}

async function embedBatch(limit: number): Promise<number> {
    console.log(`\n🔮 Embeddings: Finding videos needing chunks (limit ${limit})...`);

    const { data: videos, error } = await supabase
        .from('videos')
        .select('id, title, transcript:transcripts(cleaned_text, raw_text)')
        .eq('status', 'completed')
        .limit(limit);

    if (error || !videos) {
        console.log('   ❌ Error fetching videos.');
        return 0;
    }

    let processed = 0;

    for (const video of videos) {
        // Check if already has chunks
        const { count } = await supabase
            .from('transcript_chunks')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', video.id);

        if (count && count > 0) continue;

        const text = (video as any).transcript?.cleaned_text || (video as any).transcript?.raw_text;
        if (!text || text.length < 50) continue;

        console.log(`   🎬 ${video.title?.slice(0, 60)}... (${text.length}c)`);

        const chunks = splitText(text);
        const records = [];

        for (const chunk of chunks) {
            try {
                const embedding = await generateEmbedding(chunk);
                records.push({ video_id: video.id, content: chunk, embedding });
            } catch (e) {
                console.error('      Embedding failed for chunk');
            }
        }

        if (records.length > 0) {
            const { error: insertError } = await supabase.from('transcript_chunks').insert(records);
            if (insertError) console.error('      ❌ Insert failed:', insertError.message);
            else {
                processed++;
                console.log(`      ✅ ${records.length} chunks saved.`);
            }
        }
    }

    return processed;
}

async function main() {
    const limit = parseInt(getArg('limit') || '10', 10);
    const enrichOnly = hasFlag('enrich-only');
    const embedOnly = hasFlag('embed-only');

    console.log('🔄 OpenTube Cron: Enrich + Embed Pipeline');
    console.log(`   Limit: ${limit} | Enrich: ${!embedOnly} | Embed: ${!enrichOnly}`);

    let enriched = 0, embedded = 0;

    if (!embedOnly) enriched = await enrichBatch(limit);
    if (!enrichOnly) embedded = await embedBatch(limit);

    console.log(`\n📊 Done. Enriched: ${enriched} | Embedded: ${embedded}`);
}

main().catch(console.error);
