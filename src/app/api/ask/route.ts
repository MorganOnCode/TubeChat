import { generateEmbedding, getClient } from '@/lib/llm';
import { NextRequest } from 'next/server';
import {
    sql,
    matchChunks,
    ftsChunks,
    getCorpusVersion,
    getCachedQuery,
    putCachedQuery,
    logQuery,
    type SemanticChunk,
} from '@/lib/db';
import { rrfFuse, normalizeQuestion, scopeKey, cacheKey } from '@/lib/retrieval';
import type { AskSource } from '@/lib/ask-types';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

// Retrieval tuning -----------------------------------------------------------
const VECTOR_FETCH = 30;        // vector arm candidates (more when scoped, below)
const FTS_FETCH = 30;           // keyword arm candidates
const FUSE_TOP = 12;            // chunks kept after RRF for synthesis
const EXTRACT_CARDS = 6;        // quote cards in extractive mode
// Below this top cosine similarity we treat the archive as not covering the
// question — return extracts / "not covered" instead of letting the LLM answer.
// Tuned from prod query_logs: real matches top out ~0.55-0.60, off-topic ~0.30
// (text-embedding-3-small gives unrelated text a non-trivial baseline). 0.35
// catches obvious off-topic; the system-prompt guard handles the borderline.
// Refine as query_logs accumulates.
const NOT_COVERED_TOP_SIM = 0.35;

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
 * Whether to spend an LLM call reformulating. First-turn, already-specific
 * questions are sent to retrieval as-is (saves one of the two gpt-4o-mini calls);
 * follow-ups (history present) and short/vague inputs still get reformulated.
 */
function shouldReformulate(userMessage: string, history: Message[]): boolean {
    if (history.length > 0) return true;                 // follow-up: needs context resolution
    const words = userMessage.trim().split(/\s+/).filter(Boolean);
    if (words.length < 3) return true;                   // too terse — let the LLM expand/greet-detect
    if (userMessage.trim().length < 12) return true;
    return false;                                        // specific first-turn question — embed directly
}

/**
 * Step 2: Hybrid retrieval — vector (semantic) + FTS (keyword) fused with RRF.
 * Returns the fused top chunks, hydrated video metadata, and the top raw cosine
 * similarity (the confidence signal for the not-covered gate).
 */
async function retrieveContext(
    searchQuery: string,
    channelId?: string,
    videoId?: string
): Promise<{ chunks: SemanticChunk[]; videos: Map<string, any>; topSimilarity: number }> {
    const embedding = await generateEmbedding(searchQuery);
    if (embedding.length === 0) return { chunks: [], videos: new Map(), topSimilarity: 0 };

    // Resolve scope → set of video ids (if a video/channel filter is active).
    let scopeVideoIds: string[] | null = null;
    if (videoId) {
        const rows = await sql<{ id: string }[]>`SELECT id FROM videos WHERE youtube_id = ${videoId} LIMIT 1`;
        if (rows.length) scopeVideoIds = [rows[0].id];
    } else if (channelId) {
        const rows = await sql<{ id: string }[]>`SELECT id FROM videos WHERE channel_id = ${channelId}`;
        scopeVideoIds = rows.map((r) => r.id);
    }
    const scoped = !!(scopeVideoIds && scopeVideoIds.length);

    // Vector arm (threshold 0 → top-k with real similarities for the gate) and
    // keyword arm, in parallel. Over-fetch the vector arm when scoped so we still
    // have candidates after the scope filter.
    let vectorHits: SemanticChunk[] = [];
    let ftsHits: SemanticChunk[] = [];
    try {
        [vectorHits, ftsHits] = await Promise.all([
            matchChunks(embedding, 0.0, scoped ? VECTOR_FETCH * 2 : VECTOR_FETCH),
            ftsChunks(searchQuery, FTS_FETCH, scopeVideoIds),
        ]);
    } catch (e) {
        console.error('Hybrid retrieval error:', e);
        return { chunks: [], videos: new Map(), topSimilarity: 0 };
    }

    if (scoped) {
        const scopeSet = new Set(scopeVideoIds as string[]);
        vectorHits = vectorHits.filter((c) => scopeSet.has(c.video_id));
    }

    const topSimilarity = vectorHits.reduce((m, c) => Math.max(m, c.similarity ?? 0), 0);

    // RRF fuse the two ranked lists → top chunks for synthesis / extracts.
    const fused = rrfFuse([vectorHits, ftsHits], FUSE_TOP);
    if (fused.length === 0) return { chunks: [], videos: new Map(), topSimilarity };

    const videoIds = [...new Set(fused.map((c) => c.video_id))];
    const videos = await sql<any[]>`
        SELECT v.id, v.youtube_id, v.title, v.published_at,
               c.id AS channel_id, c.name AS channel_name
        FROM videos v
        LEFT JOIN channels c ON c.id = v.channel_id
        WHERE v.id IN ${sql(videoIds)}
    `;
    const videoMap = new Map(videos.map((v: any) => [v.id, v]));

    return { chunks: fused, videos: videoMap, topSimilarity };
}

const SYSTEM_PROMPT = `You are ScriptTube AI, an expert research assistant with access to a database of 3,600+ transcribed YouTube videos about UFOs, UAPs, NHI (non-human intelligence), consciousness, government disclosure, ancient civilizations, and related topics.

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
- Break character as a transcript research tool`;

/** Build the chat messages (system + history + current turn with context). */
function buildMessages(
    userMessage: string,
    chunks: SemanticChunk[],
    videoMap: Map<string, any>,
    conversationHistory: Message[]
): any[] {
    const contextParts = chunks.map((chunk, i) => {
        const video = videoMap.get(chunk.video_id);
        const label = video
            ? `[Source ${i + 1}: "${video.title}" by ${video.channel_name}, ${video.published_at ? new Date(video.published_at).toISOString().split('T')[0] : 'unknown date'}]`
            : `[Source ${i + 1}]`;
        return `${label}\n${chunk.content}`;
    });
    const context = contextParts.join('\n\n---\n\n');

    const messages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    for (const msg of conversationHistory.slice(-8)) {
        messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({
        role: 'user',
        content: chunks.length > 0
            ? `${userMessage}\n\n--- RELEVANT TRANSCRIPT EXCERPTS ---\n\n${context}`
            : userMessage,
    });
    return messages;
}

/** Deduplicated source list — one clip per video, carrying its start time + deep-link URL. */
function buildSources(chunks: SemanticChunk[], videoMap: Map<string, any>): AskSource[] {
    const seenVideoIds = new Set<string>();
    return chunks
        .map((chunk): AskSource | null => {
            const video = videoMap.get(chunk.video_id);
            if (!video || seenVideoIds.has(video.youtube_id)) return null;
            seenVideoIds.add(video.youtube_id);
            const startSeconds = typeof chunk.start_time === 'number' ? chunk.start_time : null;
            const url = `/v/${video.youtube_id}${startSeconds != null ? `?t=${startSeconds}` : ''}`;
            return {
                videoId: video.youtube_id,
                channelId: video.channel_id ?? null,
                title: video.title,
                channel: video.channel_name,
                publishedAt: video.published_at,
                similarity: Math.round((chunk.similarity ?? 0) * 100),
                snippet: chunk.content.slice(0, 200),
                startSeconds,
                url,
            };
        })
        .filter((s): s is AskSource => s !== null)
        .slice(0, 8);
}

/** Extractive quote cards (no LLM): top fused chunks with longer snippets. */
function buildExtracts(chunks: SemanticChunk[], videoMap: Map<string, any>): AskSource[] {
    const seen = new Set<string>();
    const out: AskSource[] = [];
    for (const chunk of chunks) {
        const video = videoMap.get(chunk.video_id);
        if (!video) continue;
        const startSeconds = typeof chunk.start_time === 'number' ? chunk.start_time : null;
        const dedupe = `${video.youtube_id}:${startSeconds ?? ''}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        out.push({
            videoId: video.youtube_id,
            channelId: video.channel_id ?? null,
            title: video.title,
            channel: video.channel_name,
            publishedAt: video.published_at,
            similarity: Math.round((chunk.similarity ?? 0) * 100),
            snippet: chunk.content.slice(0, 360),
            startSeconds,
            url: `/v/${video.youtube_id}${startSeconds != null ? `?t=${startSeconds}` : ''}`,
        });
        if (out.length >= EXTRACT_CARDS) break;
    }
    return out;
}

/**
 * Streams the answer as newline-delimited JSON events:
 *   {type:"stage", stage:"searching"|"found"|"reading"|"answering", count?}
 *   {type:"sources", sources:[...]}
 *   {type:"extracts", extracts:[...]}        // extractive (no-LLM) mode
 *   {type:"token", text:"..."}
 *   {type:"done", tokensUsed, searchQuery, cached?, mode?}
 *   {type:"error", message}
 */
export async function POST(request: NextRequest) {
    let body: { question?: string; channelId?: string; videoId?: string; history?: Message[]; mode?: 'answer' | 'extracts' };
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { question, channelId, videoId, history = [], mode = 'answer' } = body;
    if (!question || typeof question !== 'string' || question.trim().length < 1) {
        return Response.json({ error: 'Question too short' }, { status: 400 });
    }

    const userMessage = question.trim().slice(0, 1000);
    const conversationHistory: Message[] = (history || []).slice(-10);
    const wantsExtracts = mode === 'extracts';
    const openai = getClient();
    const encoder = new TextEncoder();
    const startedAt = Date.now();

    // Cache + log identity. Only first-turn questions are cacheable (answers with
    // history depend on the conversation). Scope keys the cache per video/channel.
    const sKey = scopeKey({ channelId, videoId });
    const normalized = normalizeQuestion(userMessage);
    const cacheable = conversationHistory.length === 0;

    const stream = new ReadableStream({
        async start(controller) {
            const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
            try {
                send({ type: 'stage', stage: 'searching' });

                // --- Cache lookup (first-turn only) ---------------------------------
                let corpusVersion = '1';
                let key = '';
                if (cacheable) {
                    corpusVersion = await getCorpusVersion();
                    key = cacheKey(corpusVersion, sKey, mode, normalized);
                    const cached = await getCachedQuery(key);
                    if (cached) {
                        const p = cached.payload;
                        if (cached.mode === 'extracts') {
                            send({ type: 'stage', stage: 'found', count: p.extracts?.length ?? 0 });
                            send({ type: 'extracts', extracts: p.extracts ?? [] });
                        } else {
                            send({ type: 'stage', stage: 'found', count: p.sources?.length ?? 0 });
                            send({ type: 'sources', sources: p.sources ?? [] });
                            send({ type: 'stage', stage: 'answering' });
                            if (p.answer) send({ type: 'token', text: p.answer });
                        }
                        send({ type: 'done', tokensUsed: 0, searchQuery: p.searchQuery ?? null, cached: true, mode: cached.mode });
                        controller.close();
                        void logQuery({ question: userMessage, searchQuery: p.searchQuery ?? null, scopeKey: sKey, mode: cached.mode, cacheHit: true, latencyMs: Date.now() - startedAt });
                        return;
                    }
                }

                // --- Reformulate (skipped for specific first-turn questions) --------
                let searchQuery = userMessage;
                let needsSearch = true;
                let directResponse: string | undefined;
                if (shouldReformulate(userMessage, conversationHistory)) {
                    const r = await reformulateQuery(userMessage, conversationHistory);
                    searchQuery = r.searchQuery || userMessage;
                    needsSearch = r.needsSearch;
                    directResponse = r.directResponse;
                }

                // Greeting / chitchat → direct response, no search/cache.
                if (!needsSearch && directResponse) {
                    send({ type: 'sources', sources: [] });
                    send({ type: 'stage', stage: 'answering' });
                    send({ type: 'token', text: directResponse });
                    send({ type: 'done', tokensUsed: 0, searchQuery: null, mode: 'direct' });
                    controller.close();
                    void logQuery({ question: userMessage, scopeKey: sKey, mode: 'direct', cacheHit: false, latencyMs: Date.now() - startedAt });
                    return;
                }

                // --- Hybrid retrieval ----------------------------------------------
                const { chunks, videos, topSimilarity } = await retrieveContext(searchQuery, channelId, videoId);
                const chunkIds = chunks.map((c) => c.id);

                // --- Extractive mode OR low-confidence fallback (no LLM) ------------
                const lowConfidence = topSimilarity < NOT_COVERED_TOP_SIM;
                if (wantsExtracts || lowConfidence) {
                    const extracts = buildExtracts(chunks, videos);

                    if (extracts.length === 0) {
                        // Genuinely not covered.
                        send({ type: 'sources', sources: [] });
                        send({ type: 'stage', stage: 'answering' });
                        send({ type: 'token', text: "I don't have transcript data on that specifically. Try rephrasing, or ask about a topic the archive covers (UFOs/UAP, disclosure, NHI, specific guests or channels)." });
                        send({ type: 'done', tokensUsed: 0, searchQuery, mode: 'not_covered' });
                        controller.close();
                        void logQuery({ question: userMessage, searchQuery, scopeKey: sKey, mode: 'not_covered', cacheHit: false, chunkIds, topScore: topSimilarity, latencyMs: Date.now() - startedAt });
                        return;
                    }

                    send({ type: 'stage', stage: 'found', count: extracts.length });
                    send({ type: 'extracts', extracts });
                    const resolvedMode = wantsExtracts ? 'extracts' : 'not_covered';
                    send({ type: 'done', tokensUsed: 0, searchQuery, mode: resolvedMode });
                    controller.close();

                    // Cache only an explicit extracts request (the fallback is confidence-dependent).
                    if (cacheable && wantsExtracts) {
                        void putCachedQuery({ cacheKey: key, corpusVersion, scopeKey: sKey, normalizedQuestion: normalized, mode: 'extracts', payload: { extracts, searchQuery, topSimilarity } });
                    }
                    void logQuery({ question: userMessage, searchQuery, scopeKey: sKey, mode: resolvedMode, cacheHit: false, chunkIds, topScore: topSimilarity, latencyMs: Date.now() - startedAt });
                    return;
                }

                // --- Synthesized answer --------------------------------------------
                const sources = buildSources(chunks, videos);
                send({ type: 'stage', stage: 'found', count: sources.length });
                send({ type: 'sources', sources });
                send({ type: 'stage', stage: 'reading' });

                const messages = buildMessages(userMessage, chunks, videos, conversationHistory);
                send({ type: 'stage', stage: 'answering' });

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    max_tokens: 2000,
                    temperature: 0.5,
                    messages,
                    stream: true,
                    stream_options: { include_usage: true },
                });

                let tokensUsed = 0;
                let answer = '';
                for await (const part of completion) {
                    const delta = part.choices?.[0]?.delta?.content;
                    if (delta) {
                        answer += delta;
                        send({ type: 'token', text: delta });
                    }
                    if (part.usage?.total_tokens) tokensUsed = part.usage.total_tokens;
                }
                if (!answer) {
                    send({ type: 'token', text: 'Sorry, I had trouble generating a response. Try rephrasing your question.' });
                }
                send({ type: 'done', tokensUsed, searchQuery, mode: 'answer' });
                controller.close();

                // Write-through to the cache (first-turn answers only).
                if (cacheable && answer) {
                    void putCachedQuery({ cacheKey: key, corpusVersion, scopeKey: sKey, normalizedQuestion: normalized, mode: 'answer', payload: { answer, sources, searchQuery, topSimilarity } });
                }
                void logQuery({ question: userMessage, searchQuery, scopeKey: sKey, mode: 'answer', cacheHit: false, chunkIds, topScore: topSimilarity, answerChars: answer.length, tokensUsed, latencyMs: Date.now() - startedAt });
            } catch (error) {
                console.error('Ask API stream error:', error);
                send({ type: 'error', message: 'Something went wrong generating the answer. Please retry.' });
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
        },
    });
}
