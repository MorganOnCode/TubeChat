import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

export function getClient(): OpenAI {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}

const MODEL = 'gpt-4o-mini';

/**
 * Clean and format a raw transcript
 */
export async function cleanTranscript(rawText: string): Promise<string> {
    const client = getClient();

    const maxChunkLength = 30000;
    const chunks: string[] = [];

    if (rawText.length > maxChunkLength) {
        const sentences = rawText.match(/[^.!?]+[.!?]+/g) || [rawText];
        let currentChunk = '';

        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > maxChunkLength) {
                chunks.push(currentChunk);
                currentChunk = sentence;
            } else {
                currentChunk += sentence;
            }
        }
        if (currentChunk) chunks.push(currentChunk);
    } else {
        chunks.push(rawText);
    }

    const cleanedChunks: string[] = [];

    for (const chunk of chunks) {
        const response = await client.chat.completions.create({
            model: MODEL,
            max_tokens: 4096,
            temperature: 0.3,
            messages: [
                {
                    role: 'user',
                    content: `Clean up the following transcript text:
- Fix grammar and punctuation
- Remove filler words (um, uh, like, you know) when excessive
- Format into readable paragraphs
- Preserve the original meaning and speaker's voice
- Do NOT add content that wasn't in the original
- Do NOT remove substantive content
- Keep technical terms and names exactly as spoken

Return only the cleaned transcript, no explanations.

---
${chunk}`,
                },
            ],
        });

        const content = response.choices[0]?.message?.content;
        cleanedChunks.push(content || chunk);
    }

    return cleanedChunks.join('\n\n');
}

/**
 * Generate a concise bullet-point summary of the transcript
 */
export async function generateSummary(text: string): Promise<string> {
    const client = getClient();

    const maxLength = 50000;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

    const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
            {
                role: 'user',
                content: `Create a concise bullet-point summary of this video transcript.

Guidelines:
- Use 5-10 bullet points
- Focus on key topics, announcements, and insights
- Include any specific names, projects, or technical terms mentioned
- Be factual and objective
- Format each bullet point on its own line starting with "• "

Return only the bullet points, no introduction or conclusion.

---
${truncatedText}`,
            },
        ],
    });

    return response.choices[0]?.message?.content || '';
}

/**
 * Generate 5-10 relevant tags for the content
 */
export async function generateTags(text: string): Promise<string[]> {
    const client = getClient();

    const maxLength = 30000;
    const truncatedText = text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

    const response = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 256,
        temperature: 0.3,
        messages: [
            {
                role: 'user',
                content: `Generate 5-10 relevant tags for this video transcript.

Guidelines:
- Tags should be Title Case (e.g. "Smart Contracts", NOT "smart contracts")
- Tags should be short (1-3 words)
- Focus on specific names, projects, and distinct topics
- Avoid generic terms like "video", "update", "discussion"
- Return as a JSON array of strings, e.g. ["Tag One", "Tag Two"]

Return ONLY the JSON array, nothing else.

---
${truncatedText}`,
            },
        ],
    });

    try {
        const content = response.choices[0]?.message?.content || '[]';
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
            return JSON.parse(match[0]);
        }
        return [];
    } catch {
        console.error('Failed to parse tags response');
        return [];
    }
}

/**
 * Process a transcript through the full LLM pipeline
 */
export async function processTranscript(rawText: string): Promise<{
    cleanedText: string;
    summary: string;
    tags: string[];
}> {
    const cleanedText = await cleanTranscript(rawText);

    const [summary, tags] = await Promise.all([
        generateSummary(cleanedText),
        generateTags(cleanedText),
    ]);

    return { cleanedText, summary, tags };
}

/**
 * Generate a vector embedding for the given text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const client = getClient();

    const cleanText = text.replace(/\n/g, ' ').trim();
    if (!cleanText) return [];

    const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: cleanText,
        dimensions: 1536
    });

    return response.data[0].embedding;
}
