import Link from "next/link";
import { sql, getVideos } from "@/lib/db";
import { getChannelCards } from "@/lib/channels";
import type { ScopeChannel } from "@/components/ask/AskProvider";
import { HomeHero } from "@/components/home/HomeHero";
import { ChannelsGrid } from "@/components/home/ChannelsGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { VideoRow } from "@/components/ui/VideoRow";
import { formatDuration, formatDate, formatAgo } from "@/lib/format";
import type { TopicChip } from "@/components/home/TopicRail";
import type { ActivityItem, NowIndexing } from "@/components/home/Panels";

export const revalidate = 300;

const SUGGESTIONS = [
  "What did Grusch say about NHI biologics?",
  "Compare Tic Tac witness accounts across channels",
  "Strongest evidence for crash retrievals?",
];

async function getStats() {
  try {
    const [row] = await sql<{ videos: number; channels: number; chunks: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM videos WHERE status = 'completed') AS videos,
        (SELECT COUNT(*)::int FROM channels) AS channels,
        (SELECT COUNT(*)::int FROM transcript_chunks) AS chunks
    `;
    return { videos: row?.videos ?? 0, channels: row?.channels ?? 0, chunks: row?.chunks ?? 0 };
  } catch {
    return { videos: 0, channels: 0, chunks: 0 };
  }
}

async function getTopics(): Promise<TopicChip[]> {
  try {
    const rows = await sql<{ name: string; count: number }[]>`
      SELECT tg.name, COUNT(DISTINCT vt.video_id)::int AS count
      FROM tags tg
      JOIN video_tags vt ON vt.tag_id = tg.id
      JOIN videos v ON v.id = vt.video_id AND v.status = 'completed'
      GROUP BY tg.name
      ORDER BY count DESC
    `;
    return rows;
  } catch {
    return [];
  }
}

async function getActivity(): Promise<{ items: ActivityItem[]; nowIndexing: NowIndexing | null }> {
  try {
    const recent = await sql<{ title: string; channel_name: string | null; created_at: string }[]>`
      SELECT v.title, c.name AS channel_name, v.created_at
      FROM videos v
      LEFT JOIN channels c ON c.id = v.channel_id
      WHERE v.status = 'completed'
      ORDER BY v.created_at DESC
      LIMIT 4
    `;
    const items: ActivityItem[] = recent.map((r) => ({
      body: r.channel_name ?? "Unknown channel",
      detail: r.title.length > 44 ? r.title.slice(0, 44) + "…" : r.title,
      ago: formatAgo(r.created_at),
    }));

    const inflight = await sql<{ title: string; channel_name: string | null; thumbnail_url: string | null }[]>`
      SELECT v.title, c.name AS channel_name, c.thumbnail_url
      FROM videos v
      LEFT JOIN channels c ON c.id = v.channel_id
      WHERE v.status IN ('processing', 'pending')
      ORDER BY v.updated_at DESC
      LIMIT 1
    `;
    const nowIndexing: NowIndexing | null = inflight[0]
      ? {
          name: inflight[0].channel_name ?? "Channel",
          logoUrl: inflight[0].thumbnail_url,
          label: inflight[0].title.length > 38 ? inflight[0].title.slice(0, 38) + "…" : inflight[0].title,
          percent: 60,
        }
      : null;

    return { items, nowIndexing };
  } catch {
    return { items: [], nowIndexing: null };
  }
}

export default async function Home() {
  const [stats, channels, topics, latest, activity] = await Promise.all([
    getStats(),
    getChannelCards(),
    getTopics(),
    getVideos({ limit: 6 }),
    getActivity(),
  ]);

  const scopeChannels: ScopeChannel[] = channels.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    videoCount: c.videoCount,
    logoUrl: c.thumbnailUrl,
  }));

  const trending = topics.slice(0, 5).map((t, i) => ({ title: t.name, clips: t.count, hot: i === 0 }));
  const trendMax = trending[0]?.clips ?? 1;
  const topicNames = topics.slice(0, 6).map((t) => t.name);
  const statsLabel = `${stats.videos.toLocaleString()} videos · ${stats.chunks.toLocaleString()} segments indexed`;
  const totalVideos = channels.reduce((sum, c) => sum + c.videoCount, 0);

  return (
    <main className="wrap" style={{ paddingBottom: 80 }}>
      <HomeHero
        channels={scopeChannels}
        statsLabel={statsLabel}
        suggestions={SUGGESTIONS}
        topics={topics}
        topicNames={topicNames}
        trending={trending}
        trendMax={trendMax}
        activity={activity.items}
        nowIndexing={activity.nowIndexing}
      />

      <hr className="rule" style={{ margin: "56px 0" }} />

      <section>
        <SectionHeader
          title="Indexed channels"
          right={
            <Link className="btn ghost" href="/channels" style={{ fontSize: 13 }}>
              View all →
            </Link>
          }
        />
        <ChannelsGrid channels={channels} limit={8} />
      </section>

      {latest.length > 0 && (
        <section style={{ marginTop: 56 }}>
          <SectionHeader title="Latest indexed" />
          <div className="col" style={{ gap: 2 }}>
            {latest.map((v) => (
              <VideoRow
                key={v.id}
                href={`/v/${v.youtube_id}`}
                title={v.title}
                thumbnailUrl={v.thumbnail_url}
                durationLabel={formatDuration(v.duration_seconds)}
                metaParts={[
                  v.channel ? <span key="c">{v.channel.name}</span> : null,
                  v.published_at ? <span key="d">{formatDate(v.published_at)}</span> : null,
                  v.created_at ? <span key="a">indexed {formatAgo(v.created_at)}</span> : null,
                ].filter(Boolean) as React.ReactNode[]}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
