import { config } from 'dotenv';
config();

import { sql, toVectorLiteral } from '../lib/db';
import { generateEmbedding } from '../lib/llm';
import { fetchTranscript } from '../lib/transcript';

/**
 * Backfill timestamps for the citation deep-links + click-to-seek transcript.
 *
 * For videos whose transcript_chunks have no start_time (chunked before the
 * timing change), this:
 *   1. re-fetches the TIMED caption cues (yt-dlp / Supadata),
 *   2. stores them in transcripts.segments (does NOT touch cleaned_text/summary/tags),
 *   3. re-chunks from the timed cues and replaces the video's chunks with
 *      timed ones (start_time/end_time set), atomically per video.
 *
 * Run from a residential IP (laptop) over the SSH tunnel — YouTube blocks the VPS.
 *   npm run backfill-timestamps -- --limit=25
 *   npm run backfill-timestamps -- --video=<youtube_id>
 */

const CHUNK_SIZE = 1000;

interface TimedSegment {
  text: string;
  offset: number; // ms
  duration: number; // ms
}
interface Chunk {
  text: string;
  start: number;
  end: number;
}

function getArg(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}

/** Group consecutive timed cues into ~CHUNK_SIZE windows, carrying start/end seconds. */
function chunkSegments(segments: TimedSegment[]): Chunk[] {
  const out: Chunk[] = [];
  let text = '';
  let start: number | null = null;
  let end = 0;
  for (const seg of segments) {
    const t = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (start === null) start = Math.floor((seg.offset || 0) / 1000);
    text += (text ? ' ' : '') + t;
    end = Math.ceil(((seg.offset || 0) + (seg.duration || 0)) / 1000);
    if (text.length >= CHUNK_SIZE) {
      out.push({ text, start, end });
      text = '';
      start = null;
    }
  }
  if (text.trim() && start !== null) out.push({ text, start, end });
  return out;
}

async function main() {
  const limit = parseInt(getArg('limit') || '25', 10);
  const videoArg = getArg('video');

  console.log(`🕒 Backfilling timestamps (limit: ${limit})...`);

  // Completed videos whose chunks exist but lack timing (need backfill).
  const videos = await sql<{ id: string; youtube_id: string; title: string }[]>`
    SELECT v.id, v.youtube_id, v.title
    FROM videos v
    WHERE v.status = 'completed'
      AND EXISTS (
        SELECT 1 FROM transcript_chunks tc
        WHERE tc.video_id = v.id AND tc.start_time IS NULL
      )
      ${videoArg ? sql`AND v.youtube_id = ${videoArg}` : sql``}
    ORDER BY v.published_at DESC NULLS LAST
    LIMIT ${limit}
  `;

  console.log(`Found ${videos.length} video(s) needing timestamps.\n`);
  let done = 0;
  let skipped = 0;

  for (const video of videos) {
    console.log(`🎬 ${video.title}`);
    let result;
    try {
      result = await fetchTranscript(video.youtube_id);
    } catch (e) {
      console.log(`   ⚠️  fetch failed: ${e}`);
      skipped++;
      continue;
    }
    if (!result?.segments?.length) {
      console.log(`   ⚠️  no timed segments available — skipping`);
      skipped++;
      continue;
    }

    const chunks = chunkSegments(result.segments as TimedSegment[]);
    if (!chunks.length) {
      console.log(`   ⚠️  produced 0 chunks — skipping`);
      skipped++;
      continue;
    }

    // Embed all chunks first (slow OpenAI calls), then swap atomically so
    // retrieval never sees a chunkless video.
    const rows: { content: string; start: number; end: number; vec: string }[] = [];
    for (const ch of chunks) {
      const emb = await generateEmbedding(ch.text);
      if (!emb.length) continue;
      rows.push({ content: ch.text, start: ch.start, end: ch.end, vec: toVectorLiteral(emb) });
    }
    if (!rows.length) {
      console.log(`   ⚠️  embedding produced nothing — skipping`);
      skipped++;
      continue;
    }

    await sql.begin(async (tx) => {
      await tx`UPDATE transcripts SET segments = ${JSON.stringify(result.segments)}::jsonb, updated_at = now() WHERE video_id = ${video.id}`;
      await tx`DELETE FROM transcript_chunks WHERE video_id = ${video.id}`;
      for (const r of rows) {
        await tx`
          INSERT INTO transcript_chunks (video_id, content, start_time, end_time, embedding)
          VALUES (${video.id}, ${r.content}, ${r.start}, ${r.end}, ${r.vec}::vector)
        `;
      }
    });

    done++;
    console.log(`   ✅ ${rows.length} timed chunks (${chunks[0].start}s … ${chunks[chunks.length - 1].end}s)`);
  }

  console.log(`\n✅ Done. Backfilled: ${done}, skipped: ${skipped}.`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
