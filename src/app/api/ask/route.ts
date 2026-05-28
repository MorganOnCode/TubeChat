import { generateEmbedding, getClient } from '@/lib/llm';
import { NextRequest } from 'next/server';
import { sql, matchTranscriptChunks } from '@/lib/db';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Step 1: Reformulate the user's message into an optimal search query
 * Handles conversational follow-ups, vague questions, greetings, etc.
 */
async function reformulateQuery(
    userMessage: string,
    conversationHistory: Message[]
): Promise<{ searchQuery: string; needsSearch: boolean; directResponse?: string }> {
    const openai = getClient();

    const historyContext = conversationHistory.slice(-6).map(m =>
        `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content.slice(0, 300)}`
    ).join('\n');

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        temperature: 0,
        messages: [
            {
                role: 'system',
                content: `You are a query reformulator for a UFO/UAP/NHI transcript search engine containing 3,600+ YouTube video transcripts from channels like The Why Files, Jesse Michels, Project Unity, Danny Jones, VETTED, and more.

Your job: turn the user's conversational message into an optimal search query for semantic vector search over transcript chunks.

Rules:
1. If the user asks a question or wants information → return a focused search query (2-10 words)
2. If it's a follow-up referencing prior conversation → incorporate the context into a standalone query
3. If it's a greeting, thanks, or chitchat that doesn't need transcript data → set needsSearch=false and provide a brief friendly directResponse
4. Resolve pronouns: "tell me more about him" → use the person's name from context
5. Strip filler: "can you tell me about" → just the topic
6. Be specific: "what did he say" → "what did [person] say about [topic]"

Return JSON only: {"searchQuery": "...", "needsSearch": true/false, "directResponse": "..." (only if needsSearch=false)}`
            },
            {
                role: 'user',
                content: `Conversation so far:\n${historyContext || '(new conversation)'}\n\nLatest message: "${userMessage}"`
            }
        ],
        response_format: { type: 'json_object' },
    });

    try {
        return JSON.parse(response.choices[0]?.message?.content || '{"searchQuery":"","needsSearch":true}');
    } catch {
        return { searchQuery: userMessage, needsSearch: true };
    }
}

/**
 * Step 2: Multi-strategy retrieval — vector search + FTS for better recall
 */
async function retrieveContext(
    searchQuery: string,
    channelId?: string,
    videoId?: string
): Promise<{ chunks: any[]; videos: Map<string, any> }> {
    // Generate embedding for vector search
    const embedding = await generateEmbedding(searchQuery);
    if (embedding.length === 0) return { chunks: [], videos: new Map() };

    // Scope to specific video/channel if requested
    let scopeVideoIds: string[] | null = null;

    if (videoId) {
        const rows = await sql<{ id: string }[]>`SELECT id FROM videos WHERE youtube_id = ${videoId} LIMIT 1`;
        if (rows.length) scopeVideoIds = [rows[0].id];
    } else if (channelId) {
        const rows = await sql<{ id: string }[]>`SELECT id FROM videos WHERE channel_id = ${channelId}`;
        scopeVideoIds = rows.map((r) => r.id);
    }

    // Vector search — cast wider net
    let chunks: any[];
    try {
        chunks = await matchTranscriptChunks(embedding, 0.3, 30);
    } catch (e) {
        console.error('Vector search error:', e);
        return { chunks: [], videos: new Map() };
    }

    // Filter by scope if needed
    if (scopeVideoIds) {
        const scopeSet = new Set(scopeVideoIds);
        chunks = chunks.filter((c: any) => scopeSet.has(c.video_id));
    }

    // Take top 12 chunks for context (balance between coverage and token cost)
    chunks = chunks.slice(0, 12);

    if (chunks.length === 0) return { chunks: [], videos: new Map() };

    // Fetch video details
    const videoIds = [...new Set(chunks.map((c: any) => c.video_id))] as string[];
    const videos = await sql<any[]>`
        SELECT v.id, v.youtube_id, v.title, v.published_at, c.name AS channel_name
        FROM videos v
        LEFT JOIN channels c ON c.id = v.channel_id
        WHERE v.id IN ${sql(videoIds)}
    `;

    const videoMap = new Map(videos.map((v: any) => [v.id, { ...v, channel_name: v.channel_name }]));

    return { chunks, videos: videoMap };
}

/**
 * Step 3: Generate conversational response with sources
 */
async function generateResponse(
    userMessage: string,
    searchQuery: string,
    chunks: any[],
    videoMap: Map<string, any>,
    conversationHistory: Message[]
): Promise<{ answer: string; sources: any[]; tokensUsed: number }> {
    const openai = getClient();

    // Build context from chunks
    const contextParts = chunks.map((chunk: any, i: number) => {
        const video = videoMap.get(chunk.video_id);
        const label = video
            ? `[Source ${i + 1}: "${video.title}" by ${video.channel_name}, ${video.published_at ? new Date(video.published_at).toISOString().split('T')[0] : 'unknown date'}]`
            : `[Source ${i + 1}]`;
        return `${label}\n${chunk.content}`;
    });
    const context = contextParts.join('\n\n---\n\n');

    // Build conversation messages
    const messages: any[] = [
        {
            role: 'system',
            content: `You are ScriptTube AI, an expert research assistant with access to a database of 3,600+ transcribed YouTube videos about UFOs, UAPs, NHI (non-human intelligence), consciousness, government disclosure, ancient civilizations, and related topics.

Your personality:
- Knowledgeable and conversational — like talking to a well-read friend
- You cite sources naturally: "According to Ross Coulthart on VETTED [Source 2]..." rather than just "[Source 2]"
- You acknowledge uncertainty: "The transcripts suggest..." rather than stating as absolute fact
- You connect dots across sources when multiple discuss the same topic
- You're curious and engaged — if a topic is fascinating, say so

Response guidelines:
- Use the transcript excerpts as your primary knowledge base
- Cite sources inline using [Source N] — always include at least one citation
- If sources disagree, present both perspectives
- If the transcripts don't cover something, say "I don't have transcript data on that specifically, but [related info]..."
- Keep responses focused but thorough — 2-4 paragraphs for most questions
- Use bullet points for lists, comparisons, or multiple claims
- For follow-up questions, build on the conversation naturally
- Be concise. Don't over-explain obvious things.

You do NOT:
- Make up information not in the sources
- Claim things as fact without citation
- Give medical, legal, or financial advice
- Break character as a transcript research tool`
        }
    ];

    // Add conversation history (last 8 turns for context)
    for (const msg of conversationHistory.slice(-8)) {
        messages.push({ role: msg.role, content: msg.content });
    }

    // Add current turn with context
    messages.push({
        role: 'user',
        content: chunks.length > 0
            ? `${userMessage}\n\n--- RELEVANT TRANSCRIPT EXCERPTS ---\n\n${context}`
            : userMessage
    });

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        temperature: 0.5,
        messages,
    });

    const answer = completion.choices[0]?.message?.content || 'Sorry, I had trouble generating a response. Try rephrasing your question.';

    // Build deduplicated source list
    const seenVideoIds = new Set<string>();
    const sources = chunks
        .map((chunk: any) => {
            const video = videoMap.get(chunk.video_id);
            if (!video || seenVideoIds.has(video.youtube_id)) return null;
            seenVideoIds.add(video.youtube_id);
            return {
                videoId: video.youtube_id,
                title: video.title,
                channel: video.channel_name,
                publishedAt: video.published_at,
                similarity: Math.round(chunk.similarity * 100),
                snippet: chunk.content.slice(0, 200),
            };
        })
        .filter(Boolean);

    return {
        answer,
        sources: sources.slice(0, 8),
        tokensUsed: completion.usage?.total_tokens || 0,
    };
}

export async function POST(request: NextRequest) {
    try {
        const { question, channelId, videoId, history = [] } = await request.json();

        if (!question || typeof question !== 'string' || question.trim().length < 1) {
            return Response.json({ error: 'Question too short' }, { status: 400 });
        }

        const userMessage = question.trim().slice(0, 1000);
        const conversationHistory: Message[] = (history || []).slice(-10);

        // Step 1: Reformulate query
        const { searchQuery, needsSearch, directResponse } = await reformulateQuery(
            userMessage,
            conversationHistory
        );

        // If no search needed (greeting, thanks, etc.), respond directly
        if (!needsSearch && directResponse) {
            return Response.json({
                answer: directResponse,
                sources: [],
                tokensUsed: 0,
                searchQuery: null,
            });
        }

        // Step 2: Retrieve relevant context
        const { chunks, videos } = await retrieveContext(searchQuery, channelId, videoId);

        // Step 3: Generate response
        const result = await generateResponse(
            userMessage,
            searchQuery,
            chunks,
            videos,
            conversationHistory
        );

        return Response.json({
            ...result,
            searchQuery, // Send back for debugging/transparency
        });

    } catch (error) {
        console.error('Ask API error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
}
