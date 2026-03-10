import { createClient } from '@supabase/supabase-js';
import { generateEmbedding, getClient } from '@/lib/llm';
import { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
    try {
        const { question } = await request.json();

        if (!question || typeof question !== 'string' || question.trim().length < 3) {
            return Response.json({ error: 'Question too short' }, { status: 400 });
        }

        const trimmed = question.trim().slice(0, 500);

        // 1. Generate embedding for the question
        const embedding = await generateEmbedding(trimmed);
        if (embedding.length === 0) {
            return Response.json({ error: 'Failed to generate embedding' }, { status: 500 });
        }

        // 2. Vector search for relevant transcript chunks
        const supabase = getAdminClient();
        const { data: chunks, error: searchError } = await supabase.rpc('match_transcript_chunks', {
            query_embedding: embedding,
            match_threshold: 0.4,
            match_count: 15,
        });

        if (searchError) {
            console.error('Vector search error:', searchError);
            return Response.json({ error: 'Search failed' }, { status: 500 });
        }

        if (!chunks || chunks.length === 0) {
            return Response.json({
                answer: "I couldn't find any relevant content in the transcript database for that question. Try rephrasing or asking about a topic covered by one of the indexed channels.",
                sources: [],
            });
        }

        // 3. Fetch video details for the matching chunks
        const videoIds = [...new Set(chunks.map((c: { video_id: string }) => c.video_id))];
        const { data: videos } = await supabase
            .from('videos')
            .select('id, youtube_id, title, channel:channels(name)')
            .in('id', videoIds);

        const videoMap = new Map(
            (videos || []).map((v: any) => [v.id, { ...v, channel_name: v.channel?.name }])
        );

        // 4. Build context for the LLM
        const contextParts = chunks.map((chunk: { video_id: string; content: string; similarity: number }, i: number) => {
            const video = videoMap.get(chunk.video_id);
            const label = video
                ? `[Source ${i + 1}: "${video.title}" — ${video.channel_name}]`
                : `[Source ${i + 1}]`;
            return `${label}\n${chunk.content}`;
        });

        const context = contextParts.join('\n\n---\n\n');

        // 5. Ask GPT-4o-mini to synthesize an answer
        const openai = getClient();
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 1500,
            temperature: 0.4,
            messages: [
                {
                    role: 'system',
                    content: `You are a research assistant for OpenTube, a knowledge base of UFO, UAP, and NHI YouTube channel transcripts. Answer the user's question based ONLY on the provided transcript excerpts.

Rules:
- Base your answer strictly on the provided sources. Do not hallucinate or add information not in the sources.
- Cite sources inline using [Source N] notation.
- If multiple sources discuss the same topic, synthesize them.
- If the sources don't contain enough info to fully answer, say so honestly.
- Be concise but thorough. Use bullet points for lists.
- Mention specific people, episodes, and channels by name when referenced in sources.`,
                },
                {
                    role: 'user',
                    content: `Question: ${trimmed}\n\n--- TRANSCRIPT EXCERPTS ---\n\n${context}`,
                },
            ],
        });

        const answer = completion.choices[0]?.message?.content || 'Unable to generate an answer.';

        // 6. Build source list for citations
        const sources = chunks
            .map((chunk: { video_id: string; similarity: number; content: string }) => {
                const video = videoMap.get(chunk.video_id);
                if (!video) return null;
                return {
                    videoId: video.youtube_id,
                    title: video.title,
                    channel: video.channel_name,
                    similarity: Math.round(chunk.similarity * 100),
                    snippet: chunk.content.slice(0, 200),
                };
            })
            .filter(Boolean);

        // Dedupe sources by videoId, keep highest similarity
        const seenVideoIds = new Set<string>();
        const uniqueSources = sources.filter((s: any) => {
            if (seenVideoIds.has(s.videoId)) return false;
            seenVideoIds.add(s.videoId);
            return true;
        });

        return Response.json({
            answer,
            sources: uniqueSources.slice(0, 8),
            tokensUsed: completion.usage?.total_tokens || 0,
        });

    } catch (error) {
        console.error('Ask API error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
