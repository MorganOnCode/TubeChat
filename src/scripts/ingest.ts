#!/usr/bin/env npx tsx
/**
 * tubechat — Ingestion Script (run from a residential IP / laptop; YouTube
 * blocks the VPS datacenter IP). Talks to Postgres via DATABASE_URL.
 *
 * Usage:
 *   npx tsx src/scripts/ingest.ts --channel=UCxxxx
 *   npx tsx src/scripts/ingest.ts --channel=https://www.youtube.com/@Handle
 *   npx tsx src/scripts/ingest.ts --video=VIDEO_ID
 *   npx tsx src/scripts/ingest.ts --collection=ufo
 *   npx tsx src/scripts/ingest.ts --channel=UCxxxx --limit=10 --skip-llm
 */

import { config } from 'dotenv';
config();

import { sql } from '../lib/db';
import { getChannel, getChannelVideos, getVideo, parseDuration } from '../lib/youtube';
import { fetchTranscript } from '../lib/transcript';
import { transcribeWithWhisper } from '../lib/whisper';
import { processTranscript } from '../lib/llm';
import { resolveChannelId, generateSlug } from '../lib/channel-resolver';
import { COLLECTIONS } from '../config/collections';

const args = process.argv.slice(2);
const getArg = (name: string): string | undefined => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : undefined;
};
const hasFlag = (name: string): boolean => args.includes(`--${name}`);

const channelInput = getArg('channel');
const videoId = getArg('video');
const collectionSlug = getArg('collection');
const limit = parseInt(getArg('limit') || '0', 10);
const skipLlm = hasFlag('skip-llm');
const dryRun = hasFlag('dry-run');

if (!channelInput && !videoId && !collectionSlug) {
    console.error('Usage:');
    console.error('  npx tsx src/scripts/ingest.ts --channel=URL_OR_ID [--limit=N] [--skip-llm]');
    console.error('  npx tsx src/scripts/ingest.ts --video=VIDEO_ID [--skip-llm]');
    console.error('  npx tsx src/scripts/ingest.ts --collection=SLUG [--limit=N] [--skip-llm]');
    console.error('\nAvailable collections:', COLLECTIONS.map(c => c.slug).join(', '));
    process.exit(1);
}

interface ChannelRow { id: string; name: string }

async function ensureChannel(ytChannelId: string): Promise<ChannelRow> {
    const existing = await sql<ChannelRow[]>`SELECT id, name FROM channels WHERE youtube_id = ${ytChannelId} LIMIT 1`;
    if (existing.length) {
        console.log(`📺 Using existing channel: ${existing[0].name}`);
        return existing[0];
    }

    console.log(`📺 Fetching channel info for ${ytChannelId}...`);
    const channelInfo = await getChannel(ytChannelId);
    if (!channelInfo) throw new Error(`Channel not found: ${ytChannelId}`);

    const slug = generateSlug(channelInfo.title);
    const [newChannel] = await sql<ChannelRow[]>`
        INSERT INTO channels (youtube_id, name, slug, description, thumbnail_url, subscriber_count, video_count)
        VALUES (${channelInfo.id}, ${channelInfo.title}, ${slug}, ${channelInfo.description ?? null},
                ${channelInfo.thumbnailUrl ?? null}, ${channelInfo.subscriberCount ?? null}, ${channelInfo.videoCount ?? null})
        RETURNING id, name
    `;
    console.log(`✅ Created channel: ${channelInfo.title} (slug: ${slug})`);
    return newChannel;
}

async function linkChannelToCollection(channelDbId: string, collSlug: string) {
    const coll = await sql<{ id: string }[]>`SELECT id FROM collections WHERE slug = ${collSlug} LIMIT 1`;
    if (!coll.length) {
        console.log(`⚠️  Collection "${collSlug}" not found in database`);
        return;
    }
    await sql`
        INSERT INTO channel_collections (channel_id, collection_id)
        VALUES (${channelDbId}, ${coll[0].id}) ON CONFLICT DO NOTHING
    `;
    console.log(`🔗 Linked channel to collection: ${collSlug}`);
}

async function ingestVideo(channelDbId: string, ytVideoId: string, skipLlmProcessing: boolean) {
    console.log(`\n🎬 Processing video: ${ytVideoId}`);

    const existing = await sql<{ id: string; status: string }[]>`SELECT id, status FROM videos WHERE youtube_id = ${ytVideoId} LIMIT 1`;
    if (existing[0]?.status === 'completed') {
        console.log(`   ⏭️  Already processed, skipping`);
        return { skipped: true };
    }

    const videoInfo = await getVideo(ytVideoId);
    if (!videoInfo) {
        console.log(`   ❌ Video not found on YouTube`);
        return { failed: true, error: 'Video not found' };
    }
    console.log(`   📝 Title: ${videoInfo.title.slice(0, 60)}...`);

    let videoDbId: string;
    if (existing.length) {
        videoDbId = existing[0].id;
        await sql`UPDATE videos SET status = 'processing' WHERE id = ${videoDbId}`;
    } else {
        const [newVideo] = await sql<{ id: string }[]>`
            INSERT INTO videos (channel_id, youtube_id, title, description, published_at, duration_seconds, thumbnail_url, view_count, status)
            VALUES (${channelDbId}, ${videoInfo.id}, ${videoInfo.title}, ${videoInfo.description ?? null},
                    ${videoInfo.publishedAt ?? null}, ${parseDuration(videoInfo.duration)},
                    ${videoInfo.thumbnailUrl ?? null}, ${videoInfo.viewCount ?? null}, 'processing')
            RETURNING id
        `;
        videoDbId = newVideo.id;
    }

    const log = async (step: string, status: string, details?: object) => {
        await sql`
            INSERT INTO ingestion_logs (video_id, step, status, details)
            VALUES (${videoDbId}, ${step}, ${status}, ${details ? JSON.stringify(details) : null}::jsonb)
        `;
    };

    try {
        console.log(`   📄 Fetching transcript...`);
        await log('fetch_transcript', 'started');

        let transcriptResult = await fetchTranscript(ytVideoId);
        if (!transcriptResult) {
            console.log(`   ⚠️  No captions. Attempting Whisper fallback...`);
            transcriptResult = await transcribeWithWhisper(ytVideoId);
        }
        if (!transcriptResult) {
            console.log(`   ❌ No transcript available`);
            await log('fetch_transcript', 'failed', { error: 'No transcript found' });
            await sql`UPDATE videos SET status = 'failed' WHERE id = ${videoDbId}`;
            return { failed: true, error: 'No transcript' };
        }

        console.log(`   ✅ Got transcript (${transcriptResult.text.length} chars) via ${transcriptResult.source}`);
        await log('fetch_transcript', 'completed', { source: transcriptResult.source, length: transcriptResult.text.length });

        let cleanedText = transcriptResult.text;
        let summary = '';
        let tags: string[] = [];

        if (!skipLlmProcessing) {
            console.log(`   🤖 Processing with LLM...`);
            await log('llm_processing', 'started');
            try {
                const processed = await processTranscript(transcriptResult.text);
                cleanedText = processed.cleanedText;
                summary = processed.summary;
                tags = processed.tags;
                console.log(`   ✅ LLM processing complete (${tags.length} tags)`);
                await log('llm_processing', 'completed', { tags });
            } catch (llmError) {
                console.log(`   ⚠️  LLM processing failed, using raw transcript`);
                console.error(`   Error: ${llmError}`);
                await log('llm_processing', 'failed', { error: String(llmError) });
            }
        } else {
            console.log(`   ⏭️  Skipping LLM processing`);
        }

        await sql`
            INSERT INTO transcripts (video_id, raw_text, cleaned_text, summary, source, processing_status)
            VALUES (${videoDbId}, ${transcriptResult.text}, ${cleanedText}, ${summary || null}, ${transcriptResult.source}, 'completed')
            ON CONFLICT (video_id) DO UPDATE SET
                raw_text = EXCLUDED.raw_text, cleaned_text = EXCLUDED.cleaned_text, summary = EXCLUDED.summary,
                source = EXCLUDED.source, processing_status = 'completed', updated_at = now()
        `;

        for (const tagName of tags) {
            const [tag] = await sql<{ id: string }[]>`
                INSERT INTO tags (name) VALUES (${tagName.toLowerCase()})
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id
            `;
            if (tag) {
                await sql`INSERT INTO video_tags (video_id, tag_id) VALUES (${videoDbId}, ${tag.id}) ON CONFLICT DO NOTHING`;
            }
        }

        await sql`UPDATE videos SET status = 'completed' WHERE id = ${videoDbId}`;
        console.log(`   ✅ Video processing complete!`);
        return { success: true };
    } catch (error) {
        console.error(`   ❌ Error processing video:`, error);
        await log('error', 'failed', { error: String(error) });
        await sql`UPDATE videos SET status = 'failed' WHERE id = ${videoDbId}`;
        return { failed: true, error: String(error) };
    }
}

async function ingestChannel(ytChannelId: string, collSlug?: string) {
    const channel = await ensureChannel(ytChannelId);
    if (collSlug) await linkChannelToCollection(channel.id, collSlug);

    console.log(`\n📥 Fetching videos from channel...`);
    const stats = { success: 0, skipped: 0, failed: 0 };
    let pageToken: string | undefined;
    let processedCount = 0;

    do {
        const result = await getChannelVideos(ytChannelId, { maxResults: 50, pageToken });
        console.log(`   Found ${result.videos.length} videos in this batch`);

        for (const video of result.videos) {
            if (limit > 0 && processedCount >= limit) {
                console.log(`\n⏹️  Reached limit of ${limit} videos`);
                break;
            }
            if (!dryRun) {
                const ingestResult = await ingestVideo(channel.id, video.id, skipLlm);
                if (ingestResult.success) stats.success++;
                else if (ingestResult.skipped) stats.skipped++;
                else stats.failed++;
            } else {
                console.log(`   Would process: ${video.title.slice(0, 50)}...`);
            }
            processedCount++;
        }

        pageToken = result.nextPageToken;
        if (limit > 0 && processedCount >= limit) break;
    } while (pageToken);

    return stats;
}

async function main() {
    console.log('🚀 tubechat — Ingestion Script\n');
    if (dryRun) console.log('🔍 DRY RUN MODE\n');

    const totalStats = { success: 0, skipped: 0, failed: 0 };

    if (collectionSlug) {
        const collection = COLLECTIONS.find(c => c.slug === collectionSlug);
        if (!collection) {
            console.error(`Collection not found: ${collectionSlug}`);
            console.error('Available:', COLLECTIONS.map(c => c.slug).join(', '));
            process.exit(1);
        }
        console.log(`📚 Ingesting collection: ${collection.name} (${collection.channels.length} channels)\n`);
        for (const ch of collection.channels) {
            try {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`🔍 Resolving: ${ch.url}`);
                const channelId = ch.channelId || await resolveChannelId(ch.url);
                if (!channelId) {
                    console.error(`   ❌ Could not resolve channel: ${ch.url}`);
                    totalStats.failed++;
                    continue;
                }
                console.log(`   ✅ Channel ID: ${channelId}`);
                const stats = await ingestChannel(channelId, collectionSlug);
                totalStats.success += stats.success;
                totalStats.skipped += stats.skipped;
                totalStats.failed += stats.failed;
            } catch (error) {
                console.error(`   ❌ Failed to process channel: ${ch.url}`, error);
                totalStats.failed++;
            }
        }
    } else if (channelInput) {
        console.log(`🔍 Resolving channel: ${channelInput}`);
        const channelId = await resolveChannelId(channelInput);
        if (!channelId) {
            console.error(`Could not resolve channel: ${channelInput}`);
            process.exit(1);
        }
        console.log(`✅ Channel ID: ${channelId}`);
        const stats = await ingestChannel(channelId);
        Object.assign(totalStats, stats);
    } else if (videoId) {
        const video = await getVideo(videoId);
        if (!video) {
            console.error(`Video not found: ${videoId}`);
            process.exit(1);
        }
        const channel = await ensureChannel(video.channelId);
        const result = await ingestVideo(channel.id, videoId, skipLlm);
        if (result.success) totalStats.success++;
        else if (result.skipped) totalStats.skipped++;
        else totalStats.failed++;
    }

    console.log('\n📊 Ingestion Summary:');
    console.log(`   ✅ Success: ${totalStats.success}`);
    console.log(`   ⏭️  Skipped: ${totalStats.skipped}`);
    console.log(`   ❌ Failed: ${totalStats.failed}`);
    console.log('\n✨ Done!');
}

main()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exitCode = 1;
    })
    .finally(() => sql.end());
