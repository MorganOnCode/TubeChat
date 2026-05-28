import { generateEmbedding } from './llm'; // Server-side only
import {
    VideoWithDetails,
    matchTranscriptChunks,
    searchVideos,
    tagSearchVideos,
    getVideosByIds,
} from './db';

interface SemanticResult {
    id: string; // chunk id
    video_id: string;
    content: string;
    similarity: number;
}

export async function semanticSearch(query: string, limit: number = 20): Promise<SemanticResult[]> {
    try {
        const embedding = await generateEmbedding(query);
        if (embedding.length === 0) return [];

        const chunks = await matchTranscriptChunks(embedding, 0.5, limit);
        return chunks.map((c) => ({
            id: c.id,
            video_id: c.video_id,
            content: c.content,
            similarity: c.similarity,
        }));
    } catch (e) {
        console.error('Semantic search failed:', e);
        return [];
    }
}

export async function tagSearch(query: string, limit: number = 20): Promise<VideoWithDetails[]> {
    try {
        return await tagSearchVideos(query, limit);
    } catch (e) {
        console.error('Tag search failed:', e);
        return [];
    }
}

export async function hybridSearch(query: string, limit: number = 20): Promise<VideoWithDetails[]> {
    // Run parallel searches
    const [semanticResults, keywordResults, tagResults] = await Promise.all([
        semanticSearch(query, limit),
        searchVideos(query, { limit }),
        tagSearch(query, limit),
    ]);

    // Hydrate semantic hits into full video details, attaching the best matching
    // chunk text as the snippet.
    const semanticVideoIds = [...new Set(semanticResults.map((r) => r.video_id))];
    let semanticVideos: VideoWithDetails[] = [];
    if (semanticVideoIds.length > 0) {
        const data = await getVideosByIds(semanticVideoIds);
        semanticVideos = data.map((video) => {
            const bestChunk = semanticResults.find((r) => r.video_id === video.id);
            return {
                ...video,
                transcript: {
                    ...(video.transcript || {}),
                    cleaned_text: bestChunk ? bestChunk.content : video.transcript?.cleaned_text,
                },
            };
        });
    }

    // Merge: tag → semantic → keyword, dedupe by id
    const allVideos = [...tagResults, ...semanticVideos, ...keywordResults];
    const seenIds = new Set<string>();
    const uniqueVideos: VideoWithDetails[] = [];
    for (const v of allVideos) {
        if (!seenIds.has(v.id)) {
            seenIds.add(v.id);
            uniqueVideos.push(v);
        }
    }

    return uniqueVideos.slice(0, limit);
}
