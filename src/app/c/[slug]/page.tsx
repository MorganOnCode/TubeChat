import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import "@/styles/channels.css";
import { sql, getVideos } from "@/lib/db";
import { getChannelCards, channelHandle, channelHref } from "@/lib/channels";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { ChannelAskBox } from "@/components/channels/ChannelAskBox";
import { VideoRow } from "@/components/ui/VideoRow";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatCount, formatDuration, formatDate, formatAgo } from "@/lib/format";

export const revalidate = 300;

const PER_PAGE = 24;

interface ChannelRow {
  id: string;
  youtube_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
}

interface ChannelStats {
  videos: number;
  min_year: number | null;
  max_year: number | null;
  last_indexed: string | null;
  segments: number;
}

async function getChannel(param: string): Promise<ChannelRow | null> {
  const rows = await sql<ChannelRow[]>`
    SELECT id, youtube_id, name, slug, description, thumbnail_url, subscriber_count
    FROM channels WHERE slug = ${param} OR id::text = ${param} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function getStats(channelId: string): Promise<ChannelStats> {
  try {
    const [row] = await sql<ChannelStats[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed')::int AS videos,
        MIN(EXTRACT(YEAR FROM published_at))::int AS min_year,
        MAX(EXTRACT(YEAR FROM published_at))::int AS max_year,
        MAX(created_at) AS last_indexed,
        (
          SELECT COUNT(*)::int FROM transcript_chunks tc
          JOIN videos vv ON vv.id = tc.video_id
          WHERE vv.channel_id = ${channelId}
        ) AS segments
      FROM videos WHERE channel_id = ${channelId}
    `;
    return row ?? { videos: 0, min_year: null, max_year: null, last_indexed: null, segments: 0 };
  } catch {
    return { videos: 0, min_year: null, max_year: null, last_indexed: null, segments: 0 };
  }
}

async function getTopTags(channelId: string): Promise<{ name: string; count: number }[]> {
  try {
    return await sql<{ name: string; count: number }[]>`
      SELECT tg.name, COUNT(*)::int AS count
      FROM videos v
      JOIN video_tags vt ON vt.video_id = v.id
      JOIN tags tg ON tg.id = vt.tag_id
      WHERE v.channel_id = ${channelId} AND v.status = 'completed'
      GROUP BY tg.name ORDER BY count DESC LIMIT 14
    `;
  } catch {
    return [];
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const channel = await getChannel(slug);
  if (!channel) return { title: "Channel not found — tubechat" };
  return {
    title: `${channel.name} — tubechat`,
    description: channel.description?.slice(0, 160) || `Browse ${channel.name} transcripts on tubechat.`,
  };
}

export default async function ChannelDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);

  const channel = await getChannel(slug);
  if (!channel) notFound();

  const [stats, topTags, videos, allChannels] = await Promise.all([
    getStats(channel.id),
    getTopTags(channel.id),
    getVideos({ channelId: channel.id, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    getChannelCards(),
  ]);

  const totalPages = Math.max(1, Math.ceil(stats.videos / PER_PAGE));
  const similar = allChannels.filter((c) => c.id !== channel.id).slice(0, 4);
  const coverage =
    stats.min_year && stats.max_year
      ? stats.min_year === stats.max_year
        ? `${stats.min_year}`
        : `${stats.min_year}–${stats.max_year}`
      : "—";

  return (
    <div className="wrap chx-wrap">
      <div className="breadcrumb" style={{ marginBottom: 18 }}>
        <Link className="back" href="/channels">
          ← All channels
        </Link>
        <Link href="/channels">Channels</Link>
        <span className="sep">/</span>
        <span className="cur">{channel.name}</span>
      </div>

      <div className="chd-hero">
        <ChannelAvatar logoUrl={channel.thumbnail_url} name={channel.name} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="chd-name">{channel.name}</h1>
          <div className="chd-handle">
            {channelHandle(channel)}
            {channel.subscriber_count ? ` · ${formatCount(channel.subscriber_count)} subscribers` : ""}
            {stats.last_indexed && (
              <span className="eyebrow" style={{ fontSize: 11, marginLeft: 10 }}>
                <span className="dot" />
                indexed {formatAgo(stats.last_indexed)}
              </span>
            )}
          </div>
          {channel.description && <div className="chd-blurb">{channel.description}</div>}
          <div className="chd-actions">
            <a
              className="btn"
              href={`https://www.youtube.com/channel/${channel.youtube_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              ↗ Visit on YouTube
            </a>
            <Link className="btn ghost" href={`/ask?channels=${channel.id}`}>
              ◈ Ask this channel
            </Link>
          </div>
        </div>
      </div>

      <div className="chd-statbar">
        <div className="stat">
          <div className="n">{stats.videos}</div>
          <div className="l">videos indexed</div>
        </div>
        <div className="stat">
          <div className="n">{formatCount(stats.segments)}</div>
          <div className="l">transcript segments</div>
        </div>
        <div className="stat">
          <div className="n">{coverage}</div>
          <div className="l">coverage</div>
        </div>
        <div className="stat">
          <div className="n">{stats.last_indexed ? formatAgo(stats.last_indexed) : "—"}</div>
          <div className="l">last indexed</div>
        </div>
      </div>

      <div className="chd-grid">
        <div>
          <ChannelAskBox channelId={channel.id} channelName={channel.name} videoCount={stats.videos} />

          <div className="row between" style={{ marginBottom: 14 }}>
            <span className="section-title">Videos</span>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{stats.videos} total</span>
          </div>

          {videos.length > 0 ? (
            <div className="col" style={{ gap: 2 }}>
              {videos.map((v) => (
                <VideoRow
                  key={v.id}
                  href={`/v/${v.youtube_id}`}
                  title={v.title}
                  thumbnailUrl={v.thumbnail_url}
                  durationLabel={formatDuration(v.duration_seconds)}
                  metaParts={[
                    v.published_at ? <span key="d">{formatDate(v.published_at)}</span> : null,
                    v.created_at ? <span key="a">indexed {formatAgo(v.created_at)}</span> : null,
                  ].filter(Boolean) as React.ReactNode[]}
                />
              ))}
            </div>
          ) : (
            <div style={{ padding: "28px 4px", color: "var(--ink-3)", fontSize: 14 }}>
              No videos indexed yet for this channel.
            </div>
          )}

          {totalPages > 1 && (
            <div className="row gap12" style={{ justifyContent: "center", marginTop: 24 }}>
              {page > 1 && (
                <Link className="btn" href={`${channelHref(channel)}?page=${page - 1}`}>
                  ← Previous
                </Link>
              )}
              <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link className="btn" href={`${channelHref(channel)}?page=${page + 1}`}>
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="chd-side">
          {topTags.length > 0 && (
            <div className="panel-block">
              <div className="kicker" style={{ marginBottom: 12 }}>
                Topics covered
              </div>
              <div className="row gap6 wrapf">
                {topTags.map((t) => (
                  <span key={t.name} className="topic" style={{ fontSize: 12.5, padding: "6px 11px" }}>
                    {t.name}
                    <span className="ct">{t.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {similar.length > 0 && (
            <div className="panel-block">
              <div className="kicker" style={{ marginBottom: 12 }}>
                Similar channels
              </div>
              <div className="col" style={{ gap: 10 }}>
                {similar.map((x) => (
                  <Link
                    key={x.id}
                    href={channelHref(x)}
                    className="row gap10"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <ChannelAvatar logoUrl={x.thumbnailUrl} name={x.name} size="tiny" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{x.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--ink-3)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatCount(x.subscriberCount)} · {x.videoCount} vids
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
