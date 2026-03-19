#!/usr/bin/env npx tsx
/**
 * VPS Cron: Smart ingestion for OpenTube collections.
 *
 * Budget-aware: max 3 videos/day averaged over the billing cycle (11th–11th).
 * Cascading transcript sources: yt-dlp → YouTube API captions → Supadata (1 credit each).
 * Logs everything to data/cron-ingest.log and Supabase ingestion_logs.
 *
 * Usage:
 *   npx tsx src/scripts/cron-ingest.ts                    # normal run
 *   npx tsx src/scripts/cron-ingest.ts --dry-run          # discover only, no writes
 *   npx tsx src/scripts/cron-ingest.ts --collection=ufo   # specific collection (default: ufo)
 *   npx tsx src/scripts/cron-ingest.ts --force=3           # override daily budget
 *   npx tsx src/scripts/cron-ingest.ts --status            # print budget/backlog status
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getChannelVideos, getVideo, parseDuration } from '../lib/youtube';
import { processTranscript, generateEmbedding } from '../lib/llm';
import { COLLECTIONS } from '../config/collections';
import { resolveChannelId } from '../lib/channel-resolver';

config();

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_DAILY_BUDGET = 3;
const BILLING_CYCLE_DAY = 11; // resets on 11th of each month
const MONTHLY_CREDITS = 100;
const STATE_FILE = path.join(__dirname, '../../data/cron-ingest-state.json');
const LOG_FILE = path.join(__dirname, '../../data/cron-ingest.log');
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

// ─── Args ─────────────────────────────────────────────────────────────────────
const getArg = (name: string): string | null => {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=').slice(1).join('=') : null;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const DRY_RUN = hasFlag('dry-run');
const STATUS_ONLY = hasFlag('status');
const SKIP_LLM = hasFlag('skip-llm');
const collectionSlug = getArg('collection') || 'ufo';
const forceBudget = getArg('force') ? parseInt(getArg('force')!, 10) : null;

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: Record<string, unknown>) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`;
    console.log(line);
    try {
        const dir = path.dirname(LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + '\n');
    } catch { /* best effort */ }
}

// ─── State Management ─────────────────────────────────────────────────────────
interface CronState {
    lastRun: string | null;
    supadataCreditsUsed: number; // within current billing cycle
    billingCycleStart: string;   // ISO date of current cycle start
    videosProcessedToday: number;
    todayDate: string;           // YYYY-MM-DD
    backlog: string[];           // youtube video IDs waiting to be processed
    history: { date: string; processed: number; supadataUsed: number; errors: number }[];
}

function defaultState(): CronState {
    return {
        lastRun: null,
        supadataCreditsUsed: 0,
        billingCycleStart: getBillingCycleStart().toISOString(),
        videosProcessedToday: 0,
        todayDate: todayStr(),
        backlog: [],
        history: [],
    };
}

function loadState(): CronState {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            return { ...defaultState(), ...raw };
        }
    } catch (e) {
        log('WARN', `Failed to load state: ${e}`);
    }
    return defaultState();
}

function saveState(state: CronState) {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        log('ERROR', `Failed to save state: ${e}`);
    }
}

function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
}

function getBillingCycleStart(): Date {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0-indexed
    if (now.getUTCDate() >= BILLING_CYCLE_DAY) {
        return new Date(Date.UTC(y, m, BILLING_CYCLE_DAY));
    }
    // previous month's 11th
    return new Date(Date.UTC(y, m - 1, BILLING_CYCLE_DAY));
}

function getDaysRemainingInCycle(): number {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    let cycleEnd: Date;
    if (now.getUTCDate() >= BILLING_CYCLE_DAY) {
        cycleEnd = new Date(Date.UTC(y, m + 1, BILLING_CYCLE_DAY));
    } else {
        cycleEnd = new Date(Date.UTC(y, m, BILLING_CYCLE_DAY));
    }
    return Math.max(1, Math.ceil((cycleEnd.getTime() - now.getTime()) / 86400000));
}

// ─── Budget Calculation ───────────────────────────────────────────────────────
function computeBudget(state: CronState): { dailyBudget: number; creditsRemaining: number; daysRemaining: number } {
    const cycleStart = getBillingCycleStart();
    // Reset credits if new billing cycle
    if (new Date(state.billingCycleStart) < cycleStart) {
        state.supadataCreditsUsed = 0;
        state.billingCycleStart = cycleStart.toISOString();
    }

    const creditsRemaining = MONTHLY_CREDITS - state.supadataCreditsUsed;
    const daysRemaining = getDaysRemainingInCycle();

    // Distribute remaining credits evenly, but cap at MAX_DAILY_BUDGET
    const idealDaily = Math.floor(creditsRemaining / daysRemaining);
    const dailyBudget = forceBudget ?? Math.min(idealDaily, MAX_DAILY_BUDGET);

    return { dailyBudget, creditsRemaining, daysRemaining };
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
function getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) throw new Error('Missing Supabase env vars');
    return createClient(url, key);
}

// ─── Discovery: find new videos across collection channels ────────────────────
async function discoverNewVideos(supabase: SupabaseClient, collection: typeof COLLECTIONS[0]): Promise<string[]> {
    const newVideoIds: string[] = [];

    for (const ch of collection.channels) {
        try {
            const channelId = ch.channelId || await resolveChannelId(ch.url);
            if (!channelId) {
                log('WARN', `Could not resolve channel: ${ch.url}`);
                continue;
            }

            // Get latest 10 videos from channel
            const result = await getChannelVideos(channelId, { maxResults: 10 });

            for (const video of result.videos) {
                // Check if already in DB
                const { data: existing } = await supabase
                    .from('videos')
                    .select('id, status')
                    .eq('youtube_id', video.id)
                    .single();

                if (!existing) {
                    newVideoIds.push(video.id);
                } else if (existing.status === 'failed') {
                    // Retry failed videos
                    newVideoIds.push(video.id);
                }
            }
        } catch (e) {
            log('ERROR', `Discovery failed for ${ch.url}`, { error: String(e) });
        }
    }

    return newVideoIds;
}

// ─── Transcript Cascade ───────────────────────────────────────────────────────
interface TranscriptResult {
    text: string;
    segments: { text: string; offset: number; duration: number }[];
    source: 'yt-dlp' | 'youtube_api' | 'supadata' | 'extractor';
    creditUsed: boolean;
}

async function fetchTranscriptCascade(videoId: string): Promise<TranscriptResult | null> {
    // 1. Try yt-dlp (free, expected to fail from datacenter IPs)
    log('INFO', `[${videoId}] Trying yt-dlp...`);
    try {
        const { execSync } = await import('child_process');
        const os = await import('os');
        const outputBase = path.join(os.tmpdir(), `opentube_${videoId}`);

        // Check yt-dlp available
        // Check multiple locations for yt-dlp
        const candidates = [
            path.join(__dirname, '../../.local/bin/yt-dlp'),
            '/home/openclaw/.openclaw/workspace/.local/bin/yt-dlp',
            'yt-dlp',
        ];
        const ytdlpBin = candidates.find(p => {
            try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
        }) || 'yt-dlp';

        try {
            execSync(`${ytdlpBin} --version`, { stdio: 'ignore' });
        } catch {
            log('INFO', `[${videoId}] yt-dlp not available, skipping`);
            throw new Error('yt-dlp not available');
        }

        execSync(
            `${ytdlpBin} --write-auto-sub --sub-lang "en,en-orig" --sub-format json3 --skip-download --no-warnings -o "${outputBase}" "https://www.youtube.com/watch?v=${videoId}"`,
            { stdio: 'pipe', timeout: 30000 }
        );

        // Find subtitle file
        const dir = path.dirname(outputBase);
        const base = path.basename(outputBase);
        const files = fs.readdirSync(dir).filter(f => f.startsWith(base) && f.endsWith('.json3'));

        if (files.length > 0) {
            const raw = fs.readFileSync(path.join(dir, files[0]), 'utf-8');
            const data = JSON.parse(raw);
            const events = (data.events || []).filter((e: any) => e.segs?.length > 0);
            const segments = events.map((e: any) => ({
                text: e.segs.map((s: any) => s.utf8 || '').join('').trim(),
                offset: e.tStartMs || 0,
                duration: e.dDurationMs || 0,
            })).filter((s: any) => s.text.length > 0);

            // Cleanup
            files.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });

            if (segments.length > 0) {
                const text = segments.map((s: any) => s.text).join(' ').replace(/\s+/g, ' ').trim();
                log('INFO', `[${videoId}] ✅ yt-dlp success! ${segments.length} segments, ${text.length} chars`);
                return { text, segments, source: 'yt-dlp', creditUsed: false };
            }
        }
    } catch (e) {
        log('INFO', `[${videoId}] yt-dlp failed (expected): ${String(e).slice(0, 100)}`);
    }

    // 2. Try YouTube API captions (free, often fails for auto-generated)
    log('INFO', `[${videoId}] Trying YouTube API captions...`);
    try {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (apiKey) {
            const res = await fetch(
                `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`
            );
            const data = await res.json();

            if (data.items?.length > 0) {
                // YouTube captions API requires OAuth for download, so this is discovery only
                // If manual captions exist, log it but still fall through to Supadata
                const manualCaptions = data.items.filter((i: any) =>
                    i.snippet?.trackKind === 'standard' && i.snippet?.language === 'en'
                );
                if (manualCaptions.length > 0) {
                    log('INFO', `[${videoId}] Manual English captions found but OAuth required to download`);
                }
            }
        }
    } catch (e) {
        log('INFO', `[${videoId}] YouTube API captions failed: ${String(e).slice(0, 100)}`);
    }

    // 3. Try youtube-transcript package (free, often blocked)
    log('INFO', `[${videoId}] Trying youtube-transcript package...`);
    try {
        const { YoutubeTranscript } = await import('youtube-transcript');
        const segments = await YoutubeTranscript.fetchTranscript(videoId);
        if (segments?.length > 0) {
            const mapped = segments.map((seg: any) => ({
                text: seg.text,
                offset: Math.round(seg.offset),
                duration: Math.round(seg.duration),
            }));
            const text = mapped.map((s: any) => s.text).join(' ').replace(/\s+/g, ' ').trim();
            log('INFO', `[${videoId}] ✅ youtube-transcript success! ${mapped.length} segments`);
            return { text, segments: mapped, source: 'extractor', creditUsed: false };
        }
    } catch (e) {
        log('INFO', `[${videoId}] youtube-transcript failed: ${String(e).slice(0, 100)}`);
    }

    // 4. Supadata (costs 1 credit)
    log('INFO', `[${videoId}] Falling back to Supadata (1 credit)...`);
    try {
        const { fetchTranscriptSupadata } = await import('../lib/transcript-supadata');
        const result = await fetchTranscriptSupadata(videoId);
        if (result) {
            log('INFO', `[${videoId}] ✅ Supadata success! ${result.segments.length} segments, ${result.text.length} chars`);
            return { text: result.text, segments: result.segments, source: 'supadata', creditUsed: true };
        }
    } catch (e) {
        log('ERROR', `[${videoId}] Supadata failed: ${String(e).slice(0, 100)}`);
    }

    log('WARN', `[${videoId}] All transcript sources exhausted`);
    return null;
}

// ─── Chunking + Embedding ─────────────────────────────────────────────────────
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

async function embedAndStoreChunks(supabase: SupabaseClient, videoId: string, text: string): Promise<number> {
    const chunks = splitText(text);
    const records = [];

    for (const chunk of chunks) {
        try {
            const embedding = await generateEmbedding(chunk);
            records.push({ video_id: videoId, content: chunk, embedding });
        } catch (e) {
            log('WARN', `Embedding failed for chunk of ${videoId}`);
        }
    }

    if (records.length > 0) {
        const { error } = await supabase.from('transcript_chunks').insert(records);
        if (error) {
            log('ERROR', `Chunk insert failed for ${videoId}`, { error: error.message, code: error.code });
            return 0;
        }
    }

    return records.length;
}

// ─── Process a Single Video ───────────────────────────────────────────────────
async function processVideo(
    supabase: SupabaseClient,
    ytVideoId: string,
    channelDbId: string,
    skipLlm: boolean = false
): Promise<{ success: boolean; creditUsed: boolean; error?: string }> {
    log('INFO', `Processing video: ${ytVideoId}`);

    // Get video metadata via YouTube API
    let videoInfo;
    try {
        videoInfo = await getVideo(ytVideoId);
    } catch (e) {
        log('ERROR', `Failed to get video info: ${ytVideoId}`, { error: String(e) });
        return { success: false, creditUsed: false, error: String(e) };
    }

    if (!videoInfo) {
        log('WARN', `Video not found on YouTube: ${ytVideoId}`);
        return { success: false, creditUsed: false, error: 'Video not found' };
    }

    log('INFO', `Title: ${videoInfo.title.slice(0, 80)}`);

    // Upsert video record
    const { data: existing } = await supabase
        .from('videos')
        .select('id, status')
        .eq('youtube_id', ytVideoId)
        .single();

    let videoDbId: string;

    if (existing?.status === 'completed') {
        // Check if it needs chunks
        const { count } = await supabase
            .from('transcript_chunks')
            .select('id', { count: 'exact', head: true })
            .eq('video_id', existing.id);

        if (count && count > 0) {
            log('INFO', `Already fully processed: ${ytVideoId}`);
            return { success: true, creditUsed: false };
        }
        videoDbId = existing.id;
    } else if (existing) {
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

        if (error) {
            log('ERROR', `Failed to insert video: ${ytVideoId}`, { error: error.message });
            return { success: false, creditUsed: false, error: error.message };
        }
        videoDbId = newVideo!.id;
    }

    // Fetch transcript with cascade
    const transcript = await fetchTranscriptCascade(ytVideoId);
    if (!transcript) {
        await supabase.from('videos').update({ status: 'failed' }).eq('id', videoDbId);
        await supabase.from('ingestion_logs').insert({
            video_id: videoDbId, step: 'fetch_transcript', status: 'failed',
            details: { error: 'All transcript sources exhausted' },
        });
        return { success: false, creditUsed: false, error: 'No transcript available' };
    }

    // LLM enrichment
    let cleanedText = transcript.text;
    let summary = '';
    let tags: string[] = [];

    if (!skipLlm) {
        try {
            log('INFO', `LLM enrichment for ${ytVideoId}...`);
            const processed = await processTranscript(transcript.text);
            cleanedText = processed.cleanedText;
            summary = processed.summary;
            tags = processed.tags;
            log('INFO', `LLM done: ${tags.length} tags`);
        } catch (e) {
            log('WARN', `LLM failed for ${ytVideoId}, using raw text: ${String(e).slice(0, 100)}`);
        }
    }

    // Save transcript
    await supabase.from('transcripts').upsert({
        video_id: videoDbId,
        raw_text: transcript.text,
        cleaned_text: cleanedText,
        summary: summary || null,
        source: transcript.source,
        processing_status: 'completed',
    });

    // Save tags
    for (const tagName of tags) {
        const { data: tag } = await supabase
            .from('tags')
            .upsert({ name: tagName.toLowerCase() }, { onConflict: 'name' })
            .select().single();
        if (tag) {
            await supabase.from('video_tags').upsert(
                { video_id: videoDbId, tag_id: tag.id },
                { onConflict: 'video_id,tag_id' }
            );
        }
    }

    // Generate chunks + embeddings
    const chunkCount = await embedAndStoreChunks(supabase, videoDbId, cleanedText);
    log('INFO', `Stored ${chunkCount} chunks for ${ytVideoId}`);

    // Mark completed
    await supabase.from('videos').update({ status: 'completed' }).eq('id', videoDbId);
    await supabase.from('ingestion_logs').insert({
        video_id: videoDbId, step: 'cron_ingest', status: 'completed',
        details: { source: transcript.source, creditUsed: transcript.creditUsed, chunks: chunkCount },
    });

    log('INFO', `✅ Complete: ${videoInfo.title.slice(0, 60)} (${transcript.source}, ${chunkCount} chunks)`);
    return { success: true, creditUsed: transcript.creditUsed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const state = loadState();
    const today = todayStr();

    // Reset daily counter if new day
    if (state.todayDate !== today) {
        // Save yesterday's history
        if (state.todayDate) {
            const existing = state.history.find(h => h.date === state.todayDate);
            if (!existing) {
                state.history.push({
                    date: state.todayDate,
                    processed: state.videosProcessedToday,
                    supadataUsed: 0, // tracked per cycle, not per day
                    errors: 0,
                });
            }
            // Keep last 60 days of history
            state.history = state.history.slice(-60);
        }
        state.todayDate = today;
        state.videosProcessedToday = 0;
    }

    const { dailyBudget, creditsRemaining, daysRemaining } = computeBudget(state);

    log('INFO', '═══ OpenTube Cron Ingest ═══');
    log('INFO', `Collection: ${collectionSlug} | Date: ${today}`);
    log('INFO', `Budget: ${dailyBudget}/day | Credits remaining: ${creditsRemaining}/${MONTHLY_CREDITS} | Days left in cycle: ${daysRemaining}`);
    log('INFO', `Processed today: ${state.videosProcessedToday} | Backlog: ${state.backlog.length}`);

    if (STATUS_ONLY) {
        console.log('\n📊 Status:');
        console.log(`   Daily budget: ${dailyBudget} videos`);
        console.log(`   Supadata credits: ${creditsRemaining}/${MONTHLY_CREDITS} remaining`);
        console.log(`   Billing cycle: ${daysRemaining} days left (resets ${BILLING_CYCLE_DAY}th)`);
        console.log(`   Processed today: ${state.videosProcessedToday}`);
        console.log(`   Backlog: ${state.backlog.length} videos`);
        console.log(`   Last 7 days:`, state.history.slice(-7));
        return;
    }

    if (DRY_RUN) log('INFO', '🔍 DRY RUN — no writes');

    const supabase = getSupabase();

    // Find collection
    const collection = COLLECTIONS.find(c => c.slug === collectionSlug);
    if (!collection) {
        log('ERROR', `Collection not found: ${collectionSlug}`);
        process.exit(1);
    }

    // Discover new videos
    log('INFO', `Discovering new videos across ${collection.channels.length} channels...`);
    const newVideoIds = await discoverNewVideos(supabase, collection);
    log('INFO', `Found ${newVideoIds.length} new/retryable videos`);

    // Merge with backlog (dedup)
    const backlogSet = new Set(state.backlog);
    for (const id of newVideoIds) backlogSet.add(id);
    state.backlog = [...backlogSet];

    // Warning if backlog is large
    if (state.backlog.length > dailyBudget * 3) {
        log('WARN', `⚠️ Backlog (${state.backlog.length}) exceeds 3× daily budget (${dailyBudget * 3}). Consider increasing budget or running manually.`);
    }

    // Calculate how many to process this run
    const remainingToday = Math.max(0, dailyBudget - state.videosProcessedToday);
    const toProcess = Math.min(remainingToday, state.backlog.length);

    if (toProcess === 0) {
        log('INFO', 'Nothing to process (budget exhausted or backlog empty)');
        state.lastRun = new Date().toISOString();
        saveState(state);
        return;
    }

    log('INFO', `Processing ${toProcess} videos (${state.backlog.length} in backlog, ${remainingToday} budget remaining)`);

    // Resolve channel IDs → DB IDs
    const channelMap = new Map<string, string>();
    const { data: channels } = await supabase.from('channels').select('id, youtube_id');
    if (channels) channels.forEach(c => channelMap.set(c.youtube_id, c.id));

    let processed = 0;
    let errors = 0;
    let supadataUsed = 0;

    const videosToProcess = state.backlog.slice(0, toProcess);

    for (const ytVideoId of videosToProcess) {
        if (DRY_RUN) {
            log('INFO', `[DRY RUN] Would process: ${ytVideoId}`);
            processed++;
            continue;
        }

        try {
            // Get channel DB ID for this video
            const videoInfo = await getVideo(ytVideoId);
            const channelDbId = videoInfo ? channelMap.get(videoInfo.channelId) : null;

            if (!channelDbId) {
                log('WARN', `No channel mapping for video ${ytVideoId}, skipping`);
                errors++;
                continue;
            }

            // Check if we still have Supadata budget (in case all free methods fail)
            const canUseSupadata = creditsRemaining - supadataUsed > 0;
            if (!canUseSupadata) {
                log('WARN', `Supadata credits exhausted. Stopping. ${state.backlog.length - processed} videos remain in backlog.`);
                break;
            }

            const result = await processVideo(supabase, ytVideoId, channelDbId, SKIP_LLM);

            if (result.success) {
                processed++;
                state.videosProcessedToday++;
                // Remove from backlog
                state.backlog = state.backlog.filter(id => id !== ytVideoId);
                if (result.creditUsed) {
                    supadataUsed++;
                    state.supadataCreditsUsed++;
                }
            } else {
                errors++;
                log('ERROR', `Failed: ${ytVideoId}`, { error: result.error });
                // Keep in backlog for retry unless it's a permanent failure
                if (result.error === 'Video not found') {
                    state.backlog = state.backlog.filter(id => id !== ytVideoId);
                }
            }
        } catch (e) {
            errors++;
            log('ERROR', `Unexpected error processing ${ytVideoId}`, { error: String(e) });
        }
    }

    // Update history
    const todayHistory = state.history.find(h => h.date === today);
    if (todayHistory) {
        todayHistory.processed += processed;
        todayHistory.supadataUsed += supadataUsed;
        todayHistory.errors += errors;
    } else {
        state.history.push({ date: today, processed, supadataUsed, errors });
    }

    state.lastRun = new Date().toISOString();
    saveState(state);

    log('INFO', '═══ Summary ═══');
    log('INFO', `Processed: ${processed} | Errors: ${errors} | Supadata credits used: ${supadataUsed}`);
    log('INFO', `Remaining backlog: ${state.backlog.length} | Credits remaining: ${creditsRemaining - supadataUsed}`);

    if (errors > 0) process.exit(1);
}

main().catch(e => {
    log('ERROR', `Fatal: ${e}`);
    process.exit(1);
});
