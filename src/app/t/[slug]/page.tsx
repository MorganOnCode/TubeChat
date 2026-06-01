import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import "@/styles/topics.css";
import { getTopicDetail, getTopics } from "@/lib/topics-data";
import { TopicAskBox } from "@/components/topics/TopicAskBox";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { VideoRow } from "@/components/ui/VideoRow";
import { formatDuration, formatAgo } from "@/lib/format";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTopicDetail(slug);
  if (!data) return { title: "Topic not found — tubechat" };
  return {
    title: `${data.topic.display} — tubechat`,
    description: data.topic.blurb,
  };
}

export default async function TopicDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [data, allTopics] = await Promise.all([getTopicDetail(slug), getTopics()]);
  if (!data) notFound();

  const { topic: t, videos, channels, minYear, maxYear } = data;
  const span = minYear && maxYear ? (minYear === maxYear ? `${minYear}` : `${minYear}–${maxYear}`) : "—";
  const related = allTopics.filter((x) => x.cat === t.cat && x.slug !== t.slug).slice(0, 6);
  const explore = allTopics.filter((x) => x.cat !== t.cat && x.slug !== t.slug).slice(0, 6);

  return (
    <div className="wrap tpx-wrap">
      <div className="breadcrumb" style={{ marginBottom: 18 }}>
        <Link className="back" href="/topics">
          ← All topics
        </Link>
        <Link href="/topics">Topics</Link>
        <span className="sep">/</span>
        <span className="cur">{t.display}</span>
      </div>

      <div className="tpd-hero">
        <div className="tpd-cat">
          {t.cat}
          {t.hot && " · trending"}
        </div>
        <h1 className="tpd-name">{t.display}</h1>
        {t.blurb && <p className="tpd-blurb">{t.blurb}</p>}
      </div>

      <div className="tpd-statbar">
        <div className="stat">
          <div className="n">{t.c.toLocaleString()}</div>
          <div className="l">clips mention it</div>
        </div>
        <div className="stat">
          <div className="n">{t.v}</div>
          <div className="l">videos</div>
        </div>
        <div className="stat">
          <div className="n">{t.ch}</div>
          <div className="l">channels covering</div>
        </div>
        <div className="stat">
          <div className="n">{span}</div>
          <div className="l">span</div>
        </div>
      </div>

      <div className="tpd-grid">
        <div>
          <TopicAskBox topicName={t.display} videoCount={t.v} />

          <div className="row between" style={{ margin: "0 0 14px" }}>
            <span className="section-title">Top videos on this topic</span>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Most recent</span>
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
                  metaParts={
                    [
                      v.channel_name ? <span key="c">{v.channel_name}</span> : null,
                      v.created_at ? <span key="a">indexed {formatAgo(v.created_at)}</span> : null,
                    ].filter(Boolean) as React.ReactNode[]
                  }
                />
              ))}
            </div>
          ) : (
            <div style={{ padding: "20px 4px", color: "var(--ink-3)", fontSize: 14 }}>
              No videos indexed for this topic yet.
            </div>
          )}
        </div>

        <div className="tpd-side">
          {channels.length > 0 && (
            <div className="panel-block">
              <div className="kicker" style={{ marginBottom: 12 }}>
                Top channels covering it
              </div>
              <div className="col" style={{ gap: 10 }}>
                {channels.map((x) => (
                  <Link
                    key={x.name}
                    className="row gap10"
                    href={x.slug ? `/c/${x.slug}` : "/channels"}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <ChannelAvatar logoUrl={x.logoUrl} name={x.name} size="tiny" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{x.name}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {x.count} vids
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {related.length > 0 && (
            <div className="panel-block">
              <div className="kicker" style={{ marginBottom: 12 }}>
                Related in {t.cat}
              </div>
              <div className="row gap6 wrapf">
                {related.map((x) => (
                  <Link
                    key={x.slug}
                    className="topic"
                    href={`/t/${x.slug}`}
                    style={{ fontSize: 12.5, padding: "6px 11px", textDecoration: "none" }}
                  >
                    {x.display}
                    <span className="ct">{x.c}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {explore.length > 0 && (
            <div className="panel-block">
              <div className="kicker" style={{ marginBottom: 12 }}>
                You might also explore
              </div>
              <div className="row gap6 wrapf">
                {explore.map((x) => (
                  <Link
                    key={x.slug}
                    className="topic"
                    href={`/t/${x.slug}`}
                    style={{ fontSize: 12.5, padding: "6px 11px", textDecoration: "none" }}
                  >
                    {x.display}
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
