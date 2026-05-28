import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
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
 * Security: Requires CRON_SECRET header or query param.
 *
 * NOTE: On the self-hosted VPS, YouTube blocks the datacenter IP for transcript
 * fetching — run ingestion from a residential IP (the laptop) via the scripts in
 * src/scripts instead. This route is retained for parity / proxy use.
 */

export const maxDuration = 300;

function verifyCronSecret(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    const headerSecret = request.headers.get('x-cron-secret');
    const querySecret = request.nextUrl.searchParams.get('secret');
    return headerSecret === secret || querySecret === secret;
}

interface ChannelRow { id: string; name: string }

async function ensureChannel(ytChannelId: string): Promise<ChannelRow> {
    const existing = await sql<ChannelRow[]>`
        SELECT id, name FROM channels WHERE youtube_id = ${ytChannelId} LIMIT 1
    `;
    if (existing.length) return existing[0];

    const channelInfo = await getChannel(ytChannelId);
    if (!channelInfo) throw new Error(`Channel not found: ${ytChannelId}`);

    const slug = generateSlug(channelInfo.title);
    const [newChannel] = await sql<ChannelRow[]>`
        INSERT INTO channels (youtube_id, name, slug, description, thumbnail_url, subscriber_count, video_count)
        VALUES (
            ${channelInfo.id}, ${channelInfo.title}, ${slug}, ${channelInfo.description ?? null},
            ${channelInfo.thumbnailUrl ?? null}, ${channelInfo.subscriberCount ?? null}, ${channelInfo.videoCount ?? null}
        )
        RETURNING id, name
    `;
    return newChannel;
}

async function linkChannelToCollection(channelDbId: string, collSlug: string) {
    const coll = await sql<{ id: string }[]>`SELECT id FROM collections WHERE slug = ${collSlug} LIMIT 1`;
    if (!coll.length) return;
    await sql`
        INSERT INTO channel_collections (channel_id, collection_id)
        VALUES (${channelDbId}, ${coll[0].id})
        ON CONFLICT DO NOTHING
    `;
}

async function ingestVideo(
    channelDbId: string,
    ytVideoId: string,
    skipLlm: boolean
): Promise<{ success?: boolean; skipped?: boolean; failed?: boolean; error?: string }> {
    const existing = await sql<{ id: string; status: string }[]>`
        SELECT id, status FROM videos WHERE youtube_id = ${ytVideoId} LIMIT 1
    `;
    if (existing[0]?.status === 'completed') return { skipped: true };

    const videoInfo = await getVideo(ytVideoId);
    if (!videoInfo) return { failed: true, error: 'Video not found' };

    let videoDbId: string;
    if (existing.length) {
        videoDbId = existing[0].id;
        await sql`UPDATE videos SET status = 'processing' WHERE id = ${videoDbId}`;
    } else {
        const [newVideo] = await sql<{ id: string }[]>`
            INSERT INTO videos (channel_id, youtube_id, title, description, published_at, duration_seconds, thumbnail_url, view_count, status)
            VALUES (
                ${channelDbId}, ${videoInfo.id}, ${videoInfo.title}, ${videoInfo.description ?? null},
                ${videoInfo.publishedAt ?? null}, ${parseDuration(videoInfo.duration)},
                ${videoInfo.thumbnailUrl ?? null}, ${videoInfo.viewCount ?? null}, 'processing'
            )
            RETURNING id
        `;
        videoDbId = newVideo.id;
    }

    try {
        const transcriptResult = await fetchTranscript(ytVideoId);
        if (!transcriptResult) {
            await sql`UPDATE videos SET status = 'failed' WHERE id = ${videoDbId}`;
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

        await sql`
            INSERT INTO transcripts (video_id, raw_text, cleaned_text, summary, source, processing_status)
            VALUES (${videoDbId}, ${transcriptResult.text}, ${cleanedText}, ${summary || null}, ${transcriptResult.source}, 'completed')
            ON CONFLICT (video_id) DO UPDATE SET
                raw_text = EXCLUDED.raw_text,
                cleaned_text = EXCLUDED.cleaned_text,
                summary = EXCLUDED.summary,
                source = EXCLUDED.source,
                processing_status = 'completed',
                updated_at = now()
        `;

        for (const tagName of tags) {
            const [tag] = await sql<{ id: string }[]>`
                INSERT INTO tags (name) VALUES (${tagName.toLowerCase()})
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
            `;
            if (tag) {
                await sql`
                    INSERT INTO video_tags (video_id, tag_id)
                    VALUES (${videoDbId}, ${tag.id})
                    ON CONFLICT DO NOTHING
                `;
            }
        }

        await sql`UPDATE videos SET status = 'completed' WHERE id = ${videoDbId}`;
        return { success: true };
    } catch (error) {
        await sql`UPDATE videos SET status = 'failed' WHERE id = ${videoDbId}`;
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

    const results = { processed: 0, skipped: 0, failed: 0, errors: [] as string[], channels: [] as string[] };

    try {
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

                const channel = await ensureChannel(channelId);
                results.channels.push(channel.name);

                if (collSlug) {
                    await linkChannelToCollection(channel.id, collSlug);
                }

                const { videos } = await getChannelVideos(channelId, { maxResults: limit });

                for (const video of videos.slice(0, limit)) {
                    const result = await ingestVideo(channel.id, video.id, skipLlm);
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
