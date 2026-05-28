import { config } from 'dotenv';
config();

import { sql, toVectorLiteral } from '../lib/db';
import { generateEmbedding } from '../lib/llm';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 100;

function getArg(name: string): string | null {
    const arg = process.argv.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : null;
}

function splitText(text: string): string[] {
    const chunks: string[] = [];
    if (!text) return chunks;
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

async function generateEmbeddings() {
    const limit = parseInt(getArg('limit') || '10', 10);
    const videoIdArg = getArg('video');

    console.log(`🧠 Generating Semantic Embeddings (Limit: ${limit})...`);

    // Completed videos that have a transcript but no chunks yet.
    const videos = await sql<{ id: string; title: string; cleaned_text: string | null; raw_text: string | null }[]>`
        SELECT v.id, v.title, t.cleaned_text, t.raw_text
        FROM videos v
        JOIN transcripts t ON t.video_id = v.id
        WHERE v.status = 'completed'
          AND NOT EXISTS (SELECT 1 FROM transcript_chunks tc WHERE tc.video_id = v.id)
          ${videoIdArg ? sql`AND v.id = ${videoIdArg}` : sql``}
        LIMIT ${limit}
    `;

    console.log(`Found ${videos.length} videos to process.`);
    let processedCount = 0;

    for (const video of videos) {
        const textToChunk = video.cleaned_text || video.raw_text;
        if (!textToChunk) {
            console.log(`   ⚠️  No text found for video: ${video.title}`);
            continue;
        }

        console.log(`   🎬 Processing: ${video.title} (${textToChunk.length} chars)`);
        const chunks = splitText(textToChunk);
        console.log(`      Generated ${chunks.length} chunks.`);

        let inserted = 0;
        for (const content of chunks) {
            try {
                const embedding = await generateEmbedding(content);
                if (!embedding.length) continue;
                await sql`
                    INSERT INTO transcript_chunks (video_id, content, embedding)
                    VALUES (${video.id}, ${content}, ${toVectorLiteral(embedding)}::vector)
                `;
                inserted++;
            } catch (e) {
                console.error('      Embedding failed:', e);
            }
        }

        if (inserted > 0) {
            processedCount++;
            console.log(`      ✅ ${inserted} chunks saved.`);
        }
    }

    console.log(`\n✅ Finished embedding generation. New videos processed: ${processedCount}`);
}

generateEmbeddings()
    .catch((e) => { console.error('Fatal error:', e); process.exitCode = 1; })
    .finally(() => sql.end());
