/**
 * Transcript extraction via Supadata API.
 * Works from any IP (no YouTube bot detection).
 * Requires SUPADATA_API_KEY env var.
 */

export interface SupadataTranscriptSegment {
    text: string;
    offset: number;
    duration: number;
}

export interface SupadataResult {
    text: string;
    segments: SupadataTranscriptSegment[];
    source: 'supadata';
}

export async function fetchTranscriptSupadata(videoId: string): Promise<SupadataResult | null> {
    const apiKey = process.env.SUPADATA_API_KEY;
    if (!apiKey) {
        console.log('[Supadata] No API key configured, skipping');
        return null;
    }

    try {
        console.log(`[Supadata] Fetching transcript for ${videoId}...`);

        const res = await fetch(
            `https://api.supadata.ai/v1/transcript?url=https://youtu.be/${videoId}&text=false`,
            {
                headers: { 'x-api-key': apiKey },
                signal: AbortSignal.timeout(30000),
            }
        );

        if (!res.ok) {
            const body = await res.text();
            console.error(`[Supadata] Error ${res.status}: ${body}`);
            return null;
        }

        const data = await res.json();

        if (!data || (!data.content && !data.transcript)) {
            console.log(`[Supadata] No transcript data for ${videoId}`);
            return null;
        }

        // Supadata returns { content: [{ text, start, duration }] } or similar
        const entries = data.content || data.transcript || [];

        if (Array.isArray(entries) && entries.length > 0) {
            const segments: SupadataTranscriptSegment[] = entries.map((e: any) => ({
                text: (e.text || e.utf8 || '').trim(),
                offset: Math.round((e.start || e.offset || e.tStartMs || 0) * 1000),
                duration: Math.round((e.duration || e.dur || e.dDurationMs || 0) * 1000),
            })).filter((s: SupadataTranscriptSegment) => s.text.length > 0);

            const fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();

            console.log(`[Supadata] ✅ Got ${segments.length} segments (${fullText.length} chars) for ${videoId}`);
            return { text: fullText, segments, source: 'supadata' };
        }

        // If text-only response
        if (typeof data === 'string' || data.text) {
            const text = (typeof data === 'string' ? data : data.text).trim();
            if (text.length > 0) {
                console.log(`[Supadata] ✅ Got text-only transcript (${text.length} chars) for ${videoId}`);
                return { text, segments: [], source: 'supadata' };
            }
        }

        return null;
    } catch (error) {
        console.error(`[Supadata] Error for ${videoId}:`, error);
        return null;
    }
}
