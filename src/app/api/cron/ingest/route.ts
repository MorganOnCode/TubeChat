import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getChannel, getChannelVideos, getVideo, parseDuration } from '@/lib/youtube';
import { fetchTranscript } from '@/lib/transcript';
import { processTranscript } from '@/lib/llm';
import { resolveChannelId, generateSlug } from '@/lib/channel-resolver';
import { COLLECTIONS } from '@/config/collections';

/**
 * Ingestion API endpoint
 * 
 * Modes:
 *   GET /api/cron/ingest                     — ingest all collections (limit 3 per channel)
 *   GET /api/cron/ingest?collection=ufo      — ingest specific collection
 *   GET /api/cron/ingest?channel=@handle      — ingest specific channel
 *   GET /api/cron/ingest?limit=5             — control videos per channel
 *   GET /api/cron/ingest?skip-llm=true       — skip LLM processing
 * 
 * Security: Requires CRON_SECRET header or query param
 */

export const maxDuration = 300; // 5 minutes max for Vercel

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase environment variables');
    return createClient(url, key);
}

function verifyCronSecret(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    const headerSecret = request.headers.get('x-cron-secret');
    const querySecret = request.nextUrl.searchParams.get('secret');
    return headerSecret === secret || querySecret === secret;
}

async function ensureChannel(supabase: ReturnType<typeof getSupabase>, ytChannelId: string) {
    const { data: existing } = await supabase
        .from('channels')
        .select('*')
        .eq('youtube_id', ytChannelId)
        .single();

    if (existing) return existing;

    const channelInfo = await getChannel(ytChannelId);
    if (!channelInfo) throw new Error(`Channel not found: ${ytChannelId}`);

    const slug = generateSlug(channelInfo.title);
    const { data: newChannel, error } = await supabase
        .from('channels')
        .insert({
            youtube_id: channelInfo.id,
            name: channelInfo.title,
            slug,
            description: channelInfo.description,
            thumbnail_url: channelInfo.thumbnailUrl,
            subscriber_count: channelInfo.subscriberCount,
            video_count: channelInfo.videoCount,
        })
        .select()
        .single();

    if (error) throw error;
    return newChannel;
}

async function linkChannelToCollection(
    supabase: ReturnType<typeof getSupabase>,
    channelDbId: string,
    collSlug: string
) {
    const { data: collection } = await supabase
        .from('collections')
        .select('id')
        .eq('slug', collSlug)
        .single();

    if (!collection) return;
    await supabase
        .from('channel_collections')
        .upsert({ channel_id: channelDbId, collection_id: collection.id });
}

async function ingestVideo(
    supabase: ReturnType<typeof getSupabase>,
    channelDbId: string,
    ytVideoId: string,
    skipLlm: boolean
): Promise<{ success?: boolean; skipped?: boolean; failed?: boolean; error?: string }> {
    const { data: existing } = await supabase
        .from('videos')
        .select('id, status')
        .eq('youtube_id', ytVideoId)
        .single();

    if (existing?.status === 'completed') return { skipped: true };

    const videoInfo = await getVideo(ytVideoId);
    if (!videoInfo) return { failed: true, error: 'Video not found' };

    let videoDbId: string;
    if (existing) {
        videoDbId = existing.id;
        await supabase.from('videos').update({ status: 'processing' }).eq('id', videoDbId);
    } else {
        const { data: newVideo, error } = await supabase
            .from('videos')
            .insert({
                channel_id: channelDbId,
                youtube_id: videoInfo.id,
                title: videoInfo.title,
                description: videoInfo.description,
                published_at: videoInfo.publishedAt,
                duration_seconds: parseDuration(videoInfo.duration),
                thumbnail_url: videoInfo.thumbnailUrl,
                view_count: videoInfo.viewCount,
                status: 'processing',
            })
            .select()
            .single();

        if (error) throw error;
        videoDbId = newVideo.id;
    }

    try {
        const transcriptResult = await fetchTranscript(ytVideoId);
        if (!transcriptResult) {
            await supabase.from('videos').update({ status: 'failed' }).eq('id', videoDbId);
            return { failed: true, error: 'No transcript available' };
        }

        let cleanedText = transcriptResult.text;
        let summary = '';
        let tags: string[] = [];

        if (!skipLlm) {
            try {
                const processed = await processTranscript(transcriptResult.text);
                cleanedText = processed.cleanedText;
                summary = processed.summary;
                tags = processed.tags;
            } catch (llmError) {
                console.error(`LLM error for ${ytVideoId}:`, llmError);
            }
        }

        await supabase.from('transcripts').upsert({
            video_id: videoDbId,
            raw_text: transcriptResult.text,
            cleaned_text: cleanedText,
            summary: summary || null,
            source: transcriptResult.source,
            processing_status: 'completed',
        });

        for (const tagName of tags) {
            const { data: tag } = await supabase
                .from('tags')
                .upsert({ name: tagName.toLowerCase() }, { onConflict: 'name' })
                .select()
                .single();
            if (tag) {
                await supabase.from('video_tags').upsert({ video_id: videoDbId, tag_id: tag.id });
            }
        }

        await supabase.from('videos').update({ status: 'completed' }).eq('id', videoDbId);
        return { success: true };
    } catch (error) {
        await supabase.from('videos').update({ status: 'failed' }).eq('id', videoDbId);
        return { failed: true, error: String(error) };
    }
}

export async function GET(request: NextRequest) {
    if (!verifyCronSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const collectionSlug = request.nextUrl.searchParams.get('collection');
    const channelInput = request.nextUrl.searchParams.get('channel');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '3', 10);
    const skipLlm = request.nextUrl.searchParams.get('skip-llm') === 'true';

    const supabase = getSupabase();
    const results = { processed: 0, skipped: 0, failed: 0, errors: [] as string[], channels: [] as string[] };

    try {
        // Determine which channels to process
        let channelUrls: { url: string; collSlug?: string }[] = [];

        if (channelInput) {
            channelUrls = [{ url: channelInput }];
        } else {
            const targetCollections = collectionSlug
                ? COLLECTIONS.filter(c => c.slug === collectionSlug)
                : COLLECTIONS;

            for (const coll of targetCollections) {
                for (const ch of coll.channels) {
                    channelUrls.push({ url: ch.url, collSlug: coll.slug });
                }
            }
        }

        for (const { url, collSlug } of channelUrls) {
            try {
                const channelId = await resolveChannelId(url);
                if (!channelId) {
                    results.errors.push(`Could not resolve: ${url}`);
                    results.failed++;
                    continue;
                }

                const channel = await ensureChannel(supabase, channelId);
                results.channels.push(channel.name);

                if (collSlug) {
                    await linkChannelToCollection(supabase, channel.id, collSlug);
                }

                const { videos } = await getChannelVideos(channelId, { maxResults: limit });

                for (const video of videos.slice(0, limit)) {
                    const result = await ingestVideo(supabase, channel.id, video.id, skipLlm);
                    if (result.success) results.processed++;
                    else if (result.skipped) results.skipped++;
                    else {
                        results.failed++;
                        if (result.error) results.errors.push(`${video.id}: ${result.error}`);
                    }
                }
            } catch (error) {
                results.errors.push(`${url}: ${String(error)}`);
                results.failed++;
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            results,
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: String(error), results },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    return GET(request);
}
