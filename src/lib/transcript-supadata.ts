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
            `https://api.supadata.ai/v1/transcript?url=https://youtu.be/${videoId}&lang=en&text=false`,
            {
                headers: { 'x-api-key': apiKey },
                signal: AbortSignal.timeout(60000),
            }
        );

        // Handle async job (202 response for large videos)
        if (res.status === 202) {
            const jobData = await res.json();
            if (jobData.jobId) {
                console.log(`[Supadata] Async job ${jobData.jobId} for ${videoId}, polling...`);
                return await pollSupadataJob(jobData.jobId, apiKey, videoId);
            }
        }

        if (!res.ok) {
            const body = await res.text();
            console.error(`[Supadata] Error ${res.status}: ${body}`);
            return null;
        }

        const data = await res.json();
        return parseSupadataResponse(data, videoId);
    } catch (error) {
        console.error(`[Supadata] Error for ${videoId}:`, error);
        return null;
    }
}

function parseSupadataResponse(data: any, videoId: string): SupadataResult | null {
    const entries = data.content || [];

    if (Array.isArray(entries) && entries.length > 0) {
        const segments: SupadataTranscriptSegment[] = entries
            .map((e: any) => ({
                text: (e.text || '').trim(),
                offset: e.offset || 0,
                duration: e.duration || 0,
            }))
            .filter((s: SupadataTranscriptSegment) => s.text.length > 0);

        const fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
        console.log(`[Supadata] ✅ Got ${segments.length} segments (${fullText.length} chars) for ${videoId}`);
        return { text: fullText, segments, source: 'supadata' };
    }

    console.log(`[Supadata] No content for ${videoId}`);
    return null;
}

async function pollSupadataJob(jobId: string, apiKey: string, videoId: string, maxAttempts: number = 30): Promise<SupadataResult | null> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        const res = await fetch(`https://api.supadata.ai/v1/transcript/${jobId}`, {
            headers: { 'x-api-key': apiKey },
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status === 'completed' || data.content) return parseSupadataResponse(data, videoId);
        if (data.status === 'failed') { console.error(`[Supadata] Job failed for ${videoId}`); return null; }
        console.log(`[Supadata] Job ${jobId} status: ${data.status || 'processing'}...`);
    }
    console.error(`[Supadata] Job ${jobId} timed out for ${videoId}`);
    return null;
}
