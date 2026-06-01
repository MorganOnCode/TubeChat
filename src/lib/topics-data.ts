import { sql } from "./db";
import { makeTopic, categorize, slugify, type Topic } from "./topic-model";

const SPARK_BINS = 8;

/** Generated one-liner for a topic (tags carry no description of their own). */
function topicBlurb(v: number, ch: number): string {
  return `Mentioned across ${v} ${v === 1 ? "video" : "videos"} from ${ch} ${ch === 1 ? "channel" : "channels"} in the archive.`;
}

function ymIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Bucket per-tag monthly counts into a fixed 8-bin sparkline across the global span. */
function buildSparks(
  months: { name: string; ym: string; cnt: number }[],
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  if (!months.length) return map;
  const idxs = months.map((m) => ymIndex(m.ym));
  const lo = Math.min(...idxs);
  const hi = Math.max(...idxs);
  const span = Math.max(1, hi - lo);
  for (const row of months) {
    const arr = map.get(row.name) ?? new Array(SPARK_BINS).fill(0);
    let bin = Math.floor(((ymIndex(row.ym) - lo) / span) * (SPARK_BINS - 1));
    if (bin < 0) bin = 0;
    if (bin > SPARK_BINS - 1) bin = SPARK_BINS - 1;
    arr[bin] += row.cnt;
    map.set(row.name, arr);
  }
  return map;
}

/** Top auto-clustered topics (tags) with real video/channel counts + sparklines. */
export async function getTopics(limit = 60): Promise<Topic[]> {
  try {
    const rows = await sql<{ name: string; v: number; ch: number }[]>`
      SELECT tg.name,
             COUNT(DISTINCT vt.video_id)::int AS v,
             COUNT(DISTINCT vid.channel_id)::int AS ch
      FROM tags tg
      JOIN video_tags vt ON vt.tag_id = tg.id
      JOIN videos vid ON vid.id = vt.video_id AND vid.status = 'completed'
      GROUP BY tg.name
      HAVING COUNT(DISTINCT vt.video_id) >= 2
      ORDER BY v DESC
      LIMIT ${limit}
    `;
    if (!rows.length) return [];
    const names = rows.map((r) => r.name);
    const months = await sql<{ name: string; ym: string; cnt: number }[]>`
      SELECT tg.name,
             to_char(date_trunc('month', vid.published_at), 'YYYY-MM') AS ym,
             COUNT(*)::int AS cnt
      FROM tags tg
      JOIN video_tags vt ON vt.tag_id = tg.id
      JOIN videos vid ON vid.id = vt.video_id AND vid.status = 'completed'
      WHERE tg.name IN ${sql(names)} AND vid.published_at IS NOT NULL
      GROUP BY tg.name, ym
    `;
    const sparks = buildSparks(months);
    return rows.map((r) =>
      makeTopic({
        n: r.name,
        cat: categorize(r.name),
        c: r.v,
        v: r.v,
        ch: r.ch,
        spark: sparks.get(r.name),
        blurb: topicBlurb(r.v, r.ch),
      }),
    );
  } catch (e) {
    console.error("getTopics failed:", e);
    return [];
  }
}

export interface TopicChannel {
  name: string;
  slug: string | null;
  logoUrl: string | null;
  count: number;
}

export interface TopicVideo {
  id: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  created_at: string;
  channel_name: string | null;
  summary: string | null;
}

export interface TopicDetailData {
  topic: Topic;
  videos: TopicVideo[];
  channels: TopicChannel[];
  minYear: number | null;
  maxYear: number | null;
}

export async function getTopicDetail(slug: string): Promise<TopicDetailData | null> {
  try {
    // Match the tag whose slugified name equals the route slug. The expression
    // is inline (not a module-level `sql` fragment) so the lazy DB client is
    // only touched at request time, never at import/build time.
    const [tag] = await sql<{ name: string }[]>`
      SELECT name FROM tags
      WHERE trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))) = ${slug}
      ORDER BY name LIMIT 1
    `;
    if (!tag) return null;
    const name = tag.name;

    const [counts] = await sql<{ v: number; ch: number; min_year: number | null; max_year: number | null }[]>`
      SELECT COUNT(DISTINCT vid.id)::int AS v,
             COUNT(DISTINCT vid.channel_id)::int AS ch,
             MIN(EXTRACT(YEAR FROM vid.published_at))::int AS min_year,
             MAX(EXTRACT(YEAR FROM vid.published_at))::int AS max_year
      FROM tags tg
      JOIN video_tags vt ON vt.tag_id = tg.id
      JOIN videos vid ON vid.id = vt.video_id AND vid.status = 'completed'
      WHERE tg.name = ${name}
    `;

    const videos = await sql<TopicVideo[]>`
      SELECT v.id, v.youtube_id, v.title, v.thumbnail_url, v.duration_seconds,
             v.published_at, v.created_at, c.name AS channel_name, t.summary
      FROM tags tg
      JOIN video_tags vt ON vt.tag_id = tg.id
      JOIN videos v ON v.id = vt.video_id AND v.status = 'completed'
      LEFT JOIN channels c ON c.id = v.channel_id
      LEFT JOIN transcripts t ON t.video_id = v.id
      WHERE tg.name = ${name}
      ORDER BY v.published_at DESC NULLS LAST
      LIMIT 8
    `;

    const channels = await sql<TopicChannel[]>`
      SELECT c.name, c.slug, c.thumbnail_url AS "logoUrl", COUNT(DISTINCT vid.id)::int AS count
      FROM tags tg
      JOIN video_tags vt ON vt.tag_id = tg.id
      JOIN videos vid ON vid.id = vt.video_id AND vid.status = 'completed'
      JOIN channels c ON c.id = vid.channel_id
      WHERE tg.name = ${name}
      GROUP BY c.id, c.name, c.slug, c.thumbnail_url
      ORDER BY count DESC
      LIMIT 6
    `;

    const v = counts?.v ?? 0;
    const ch = counts?.ch ?? 0;
    const topic = makeTopic({ n: name, slug: slugify(name), cat: categorize(name), c: v, v, ch, blurb: topicBlurb(v, ch) });
    return { topic, videos, channels, minYear: counts?.min_year ?? null, maxYear: counts?.max_year ?? null };
  } catch (e) {
    console.error("getTopicDetail failed:", e);
    return null;
  }
}
