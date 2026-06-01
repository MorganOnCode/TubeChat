import { sql } from "./db";
import type { ChannelCard } from "./channel-utils";

export type { ChannelCard } from "./channel-utils";
export { channelHref, channelHandle } from "./channel-utils";

interface ChannelRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  video_count: number;
  segment_count: number;
}

export async function getChannelCards(): Promise<ChannelCard[]> {
  try {
    const rows = await sql<ChannelRow[]>`
      SELECT
        c.id, c.name, c.slug, c.description, c.thumbnail_url, c.subscriber_count,
        COALESCE(vc.cnt, 0)::int AS video_count,
        COALESCE(sc.cnt, 0)::int AS segment_count
      FROM channels c
      LEFT JOIN (
        SELECT channel_id, COUNT(*)::int AS cnt
        FROM videos WHERE status = 'completed'
        GROUP BY channel_id
      ) vc ON vc.channel_id = c.id
      LEFT JOIN (
        SELECT v.channel_id, COUNT(*)::int AS cnt
        FROM transcript_chunks tc
        JOIN videos v ON v.id = tc.video_id
        GROUP BY v.channel_id
      ) sc ON sc.channel_id = c.id
      ORDER BY video_count DESC, c.name
    `;

    const tagRows = await sql<{ channel_id: string; name: string; cnt: number }[]>`
      SELECT v.channel_id, tg.name, COUNT(*)::int AS cnt
      FROM video_tags vt
      JOIN videos v ON v.id = vt.video_id
      JOIN tags tg ON tg.id = vt.tag_id
      WHERE v.status = 'completed'
      GROUP BY v.channel_id, tg.name
    `;

    const grouped = new Map<string, { name: string; cnt: number }[]>();
    for (const r of tagRows) {
      const arr = grouped.get(r.channel_id) ?? [];
      arr.push({ name: r.name, cnt: r.cnt });
      grouped.set(r.channel_id, arr);
    }
    const topicsByChannel = new Map<string, string[]>();
    for (const [cid, arr] of grouped) {
      arr.sort((a, b) => b.cnt - a.cnt);
      topicsByChannel.set(cid, arr.slice(0, 3).map((t) => t.name));
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      thumbnailUrl: r.thumbnail_url,
      subscriberCount: r.subscriber_count,
      videoCount: r.video_count,
      segmentCount: r.segment_count,
      topics: topicsByChannel.get(r.id) ?? [],
    }));
  } catch (e) {
    console.error("getChannelCards failed:", e);
    return [];
  }
}
