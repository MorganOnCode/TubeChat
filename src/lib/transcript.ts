import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface TranscriptSegment {
    text: string;
    offset: number; // in milliseconds
    duration: number; // in milliseconds
}

export interface TranscriptResult {
    text: string;
    segments: TranscriptSegment[];
    source: 'youtube_captions' | 'extractor' | 'whisper' | 'yt-dlp';
}

/**
 * Fetch transcript using yt-dlp auto-subtitle extraction (primary method).
 * Downloads only the subtitle file, no audio/video.
 */
export async function fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
    // Try yt-dlp first (most reliable, works from residential IPs)
    const ytdlpResult = await fetchTranscriptYtDlp(videoId);
    if (ytdlpResult) return ytdlpResult;

    // Try Supadata API (works from any IP, needs API key)
    try {
        const { fetchTranscriptSupadata } = await import('./transcript-supadata');
        const supadataResult = await fetchTranscriptSupadata(videoId);
        if (supadataResult) {
            return {
                text: supadataResult.text,
                segments: supadataResult.segments,
                source: 'yt-dlp', // normalize source for DB
            };
        }
    } catch {
        // Supadata not available
    }

    // Fallback: try the old youtube-transcript package
    try {
        const { YoutubeTranscript } = await import('youtube-transcript');
        const segments = await YoutubeTranscript.fetchTranscript(videoId);
        if (segments && segments.length > 0) {
            const transcriptSegments: TranscriptSegment[] = segments.map((seg: { text: string; offset: number; duration: number }) => ({
                text: seg.text,
                offset: Math.round(seg.offset),
                duration: Math.round(seg.duration),
            }));
            const fullText = transcriptSegments.map((s) => s.text).join(' ');
            return { text: fullText, segments: transcriptSegments, source: 'extractor' };
        }
    } catch {
        // Expected to fail in most environments
    }

    return null;
}

/**
 * Extract auto-generated captions using yt-dlp.
 * Downloads only the subtitle file in json3 format, then parses it.
 */
async function fetchTranscriptYtDlp(videoId: string): Promise<TranscriptResult | null> {
    const tempDir = os.tmpdir();
    const outputBase = path.join(tempDir, `opentube_${videoId}`);

    try {
        // Check if yt-dlp is available
        try {
            execSync('yt-dlp --version', { stdio: 'ignore' });
        } catch {
            console.log(`[Transcript] yt-dlp not available, skipping`);
            return null;
        }

        console.log(`[Transcript] Fetching captions via yt-dlp for ${videoId}...`);

        // Optional browser cookies to pass YouTube's bot check (set
        // YTDLP_COOKIES_FROM_BROWSER=safari|chrome|brave|firefox in .env).
        const cookies = process.env.YTDLP_COOKIES_FROM_BROWSER
            ? ` --cookies-from-browser ${process.env.YTDLP_COOKIES_FROM_BROWSER}`
            : '';

        // Download auto-generated English captions in json3 format
        execSync(
            `yt-dlp${cookies} --write-auto-sub --sub-lang "en,en-orig" --sub-format json3 --skip-download --no-warnings -o "${outputBase}" "https://www.youtube.com/watch?v=${videoId}"`,
            { stdio: 'pipe', timeout: 60000 }
        );

        // Find the downloaded subtitle file
        const possibleFiles = [
            `${outputBase}.en.json3`,
            `${outputBase}.en-orig.json3`,
        ];

        let subtitleFile: string | null = null;
        for (const f of possibleFiles) {
            if (fs.existsSync(f)) {
                subtitleFile = f;
                break;
            }
        }

        if (!subtitleFile) {
            // Check for any json3 file with this base
            const dir = path.dirname(outputBase);
            const base = path.basename(outputBase);
            const files = fs.readdirSync(dir).filter(f => f.startsWith(base) && f.endsWith('.json3'));
            if (files.length > 0) {
                subtitleFile = path.join(dir, files[0]);
            }
        }

        if (!subtitleFile) {
            console.log(`[Transcript] No subtitle file found for ${videoId}`);
            return null;
        }

        console.log(`[Transcript] Parsing subtitle file: ${path.basename(subtitleFile)}`);

        const raw = fs.readFileSync(subtitleFile, 'utf-8');
        const data = JSON.parse(raw);

        // Parse json3 format: { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }
        const events = (data.events || []).filter((e: { segs?: unknown[] }) => e.segs && e.segs.length > 0);

        const segments: TranscriptSegment[] = events.map((e: { tStartMs: number; dDurationMs: number; segs: { utf8: string }[] }) => ({
            text: e.segs.map((s: { utf8: string }) => s.utf8 || '').join('').trim(),
            offset: e.tStartMs || 0,
            duration: e.dDurationMs || 0,
        })).filter((s: TranscriptSegment) => s.text.length > 0);

        // Clean up
        fs.unlinkSync(subtitleFile);

        if (segments.length === 0) {
            console.log(`[Transcript] Parsed 0 segments for ${videoId}`);
            return null;
        }

        const fullText = segments.map(s => s.text).join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        console.log(`[Transcript] ✅ Got ${segments.length} segments (${fullText.length} chars) for ${videoId}`);

        return {
            text: fullText,
            segments,
            source: 'yt-dlp',
        };

    } catch (error) {
        console.error(`[Transcript] yt-dlp error for ${videoId}:`, error);

        // Clean up any partial files
        const dir = path.dirname(outputBase);
        const base = path.basename(outputBase);
        try {
            const files = fs.readdirSync(dir).filter(f => f.startsWith(base));
            files.forEach(f => fs.unlinkSync(path.join(dir, f)));
        } catch { /* ignore cleanup errors */ }

        return null;
    }
}

/**
 * Format transcript with timestamps for display
 */
export function formatTranscriptWithTimestamps(segments: TranscriptSegment[]): string {
    return segments
        .map((seg) => {
            const seconds = Math.floor(seg.offset / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const timestamp = `[${minutes}:${remainingSeconds.toString().padStart(2, '0')}]`;
            return `${timestamp} ${seg.text}`;
        })
        .join('\n');
}

/**
 * Group transcript segments into paragraphs based on pauses
 */
export function groupIntoParagraphs(
    segments: TranscriptSegment[],
    pauseThreshold: number = 2000
): string[] {
    if (segments.length === 0) return [];

    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];

    for (let i = 0; i < segments.length; i++) {
        currentParagraph.push(segments[i].text);

        if (i < segments.length - 1) {
            const currentEnd = segments[i].offset + segments[i].duration;
            const nextStart = segments[i + 1].offset;
            const pause = nextStart - currentEnd;

            if (pause > pauseThreshold) {
                paragraphs.push(currentParagraph.join(' ').trim());
                currentParagraph = [];
            }
        }
    }

    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(' ').trim());
    }

    return paragraphs;
}

/**
 * Create a text snippet around a search term for display
 */
export function createSnippet(
    text: string,
    searchTerm: string,
    contextLength: number = 100
): string | null {
    const lowerText = text.toLowerCase();
    const lowerTerm = searchTerm.toLowerCase();
    const index = lowerText.indexOf(lowerTerm);

    if (index === -1) return null;

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + searchTerm.length + contextLength);

    let snippet = text.slice(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
}
