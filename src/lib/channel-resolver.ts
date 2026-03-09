/**
 * Resolve YouTube channel URLs/handles to channel IDs
 * Supports:
 *   - https://www.youtube.com/@Handle
 *   - https://www.youtube.com/channel/UCxxxx
 *   - https://www.youtube.com/c/ChannelName
 *   - Raw channel ID (UCxxxx)
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

function getApiKey(): string {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error('YOUTUBE_API_KEY not set');
    return key;
}

export async function resolveChannelId(input: string): Promise<string | null> {
    const trimmed = input.trim();

    // Already a channel ID
    if (trimmed.startsWith('UC') && trimmed.length === 24) {
        return trimmed;
    }

    // Extract handle or path from URL
    const urlPatterns = [
        /youtube\.com\/@([^\/\?]+)/,        // @Handle
        /youtube\.com\/channel\/(UC[^\/\?]+)/, // /channel/UCxxxx
        /youtube\.com\/c\/([^\/\?]+)/,       // /c/ChannelName
        /youtube\.com\/user\/([^\/\?]+)/,    // /user/Username
    ];

    let identifier: string | null = null;
    let isDirectId = false;

    for (const pattern of urlPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
            identifier = match[1];
            isDirectId = pattern.source.includes('channel');
            break;
        }
    }

    // If it looks like a bare handle
    if (!identifier && trimmed.startsWith('@')) {
        identifier = trimmed.slice(1);
    }

    if (!identifier) {
        // Last resort: treat as search query
        identifier = trimmed;
    }

    if (isDirectId) return identifier;

    // Resolve via YouTube API (handle → channel ID)
    const apiKey = getApiKey();

    // Try forHandle first (YouTube API v3)
    const handleUrl = new URL(`${YOUTUBE_API_BASE}/channels`);
    handleUrl.searchParams.set('part', 'id,snippet');
    handleUrl.searchParams.set('forHandle', identifier);
    handleUrl.searchParams.set('key', apiKey);

    const response = await fetch(handleUrl.toString());
    const data = await response.json();

    if (data.items && data.items.length > 0) {
        return data.items[0].id;
    }

    // Fallback: search
    const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'channel');
    searchUrl.searchParams.set('q', identifier);
    searchUrl.searchParams.set('maxResults', '1');
    searchUrl.searchParams.set('key', apiKey);

    const searchResponse = await fetch(searchUrl.toString());
    const searchData = await searchResponse.json();

    if (searchData.items && searchData.items.length > 0) {
        return searchData.items[0].snippet.channelId;
    }

    return null;
}

/**
 * Generate a URL-safe slug from a channel name
 */
export function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
}
