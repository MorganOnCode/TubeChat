import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import "@/styles/video.css";
import { sql, getVideoByYoutubeId, getVideos } from "@/lib/db";
import { cleanTranscriptText } from "@/lib/transcript-utils";
import { channelHref, channelHandle } from "@/lib/channel-utils";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { VideoDetailClient, type TimedSeg } from "@/components/video/VideoDetailClient";
import { VideoAskBox } from "@/components/video/VideoAskBox";
import { Thumb } from "@/components/ui/Thumb";
import { formatCount, formatDuration, formatDate } from "@/lib/format";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}

async function getChunks(
  videoId: string,
): Promise<{ timed: TimedSeg[]; count: number }> {
  try {
    const rows = await sql<{ content: string; start_time: number | null }[]>`
      SELECT content, start_time FROM transcript_chunks
      WHERE video_id = ${videoId}
      ORDER BY start_time ASC NULLS LAST, id
    `;
    const timed = rows
      .filter((r) => r.start_time != null)
      .map((r) => ({ start: r.start_time as number, text: r.content }));
    return { timed, count: rows.length };
  } catch {
    return { timed: [], count: 0 };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const video = await getVideoByYoutubeId(id);
  if (!video) return { title: "Video not found — tubechat" };
  const desc = video.transcript?.summary?.slice(0, 160) || video.description?.slice(0, 160);
  return {
    title: `${video.title} — tubechat`,
    description: desc,
    openGraph: {
      title: video.title,
      description: desc,
      type: "video.other",
      images: video.thumbnail_url ? [video.thumbnail_url] : [],
    },
  };
}

export default async function VideoDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { t } = await searchParams;
  const video = await getVideoByYoutubeId(id);
  if (!video) notFound();

  const startSeconds = Math.max(0, parseInt(t || "0", 10) || 0);
  const channel = video.channel;

  const [{ timed, count: segCount }, more] = await Promise.all([
    getChunks(video.id),
    channel ? getVideos({ channelId: channel.id, limit: 4 }) : Promise.resolve([]),
  ]);

  // Fallback paragraph transcript when no timed segments are available yet.
  const paragraphs =
    timed.length === 0 && video.transcript?.cleaned_text
      ? cleanTranscriptText(video.transcript.cleaned_text, {
          removeFillers: true,
          addParagraphs: true,
          sentencesPerParagraph: 4,
        })
          .split("\n\n")
          .map((p) => p.trim())
          .filter(Boolean)
      : undefined;

  const moreVideos = more.filter((v) => v.youtube_id !== video.youtube_id).slice(0, 3);

  const metaBits = [
    video.view_count ? `${video.view_count.toLocaleString()} views` : null,
    video.published_at ? formatDate(video.published_at) : null,
    video.duration_seconds ? formatDuration(video.duration_seconds) : null,
    segCount ? `${segCount} segments indexed` : null,
  ].filter(Boolean);

  return (
    <div className="wrap vid-wrap">
      <div className="breadcrumb">
        <Link className="back" href="/ask">
          ← Back to ask
        </Link>
        <Link href="/channels">Channels</Link>
        {channel && (
          <>
            <span className="sep">/</span>
            <Link href={channelHref({ slug: channel.slug ?? null, id: channel.id })}>
              {channel.name}
            </Link>
          </>
        )}
        <span className="sep">/</span>
        <span className="cur">{video.title.slice(0, 40)}…</span>
      </div>

      <VideoDetailClient
        youtubeId={video.youtube_id}
        startSeconds={startSeconds}
        segments={timed.length > 0 ? timed : undefined}
        paragraphs={paragraphs}
      >
        <h1 className="vid-title">{video.title}</h1>

        {channel && (
          <div className="vid-chrow">
            <ChannelAvatar logoUrl={channel.thumbnail_url} name={channel.name} size="sm" />
            <div style={{ minWidth: 0 }}>
              <Link
                href={channelHref({ slug: channel.slug ?? null, id: channel.id })}
                style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}
              >
                {channel.name}
              </Link>
              <div className="meta">
                {channel.subscriber_count
                  ? `${formatCount(channel.subscriber_count)} subscribers`
                  : channelHandle({ slug: channel.slug ?? null, name: channel.name })}
              </div>
            </div>
            <div className="vid-actions">
              <a
                className="btn"
                href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                YouTube ↗
              </a>
            </div>
          </div>
        )}

        {metaBits.length > 0 && (
          <div
            className="meta"
            style={{
              marginTop: 12,
              fontSize: 12.5,
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {metaBits.join(" · ")}
          </div>
        )}

        {video.tags && video.tags.length > 0 && (
          <div className="vid-tags">
            {video.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/topics/${encodeURIComponent(tag.name.toLowerCase().replace(/\s+/g, "-"))}`}
                className="topic"
                style={{ fontSize: 12.5, padding: "6px 11px", textDecoration: "none" }}
              >
                {tag.name}
              </Link>
            ))}
          </div>
        )}

        <VideoAskBox youtubeId={video.youtube_id} videoTitle={video.title} />
      </VideoDetailClient>

      {moreVideos.length > 0 && channel && (
        <section className="more-from">
          <div className="row between" style={{ marginBottom: 14 }}>
            <span className="section-title">More from {channel.name}</span>
            <Link
              className="btn ghost"
              href={channelHref({ slug: channel.slug ?? null, id: channel.id })}
              style={{ fontSize: 13 }}
            >
              View channel →
            </Link>
          </div>
          <div className="ch-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {moreVideos.map((m) => (
              <Link
                key={m.id}
                href={`/v/${m.youtube_id}`}
                className="vid-row"
                style={{
                  gridTemplateColumns: "150px 1fr",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <Thumb thumbnailUrl={m.thumbnail_url} duration={formatDuration(m.duration_seconds)} height={84} alt={m.title} />
                <div style={{ minWidth: 0 }}>
                  <div className="vid-title" style={{ fontFamily: "var(--font-ui)", fontSize: 14, fontWeight: 500, margin: 0, lineHeight: 1.35 }}>
                    {m.title}
                  </div>
                  <div className="meta" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>
                    {channel.name}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
