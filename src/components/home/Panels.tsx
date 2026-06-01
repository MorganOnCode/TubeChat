import Link from "next/link";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";

export interface TrendItem {
  title: string;
  clips: number;
  hot?: boolean;
}

/** "Trending now" — approximated from most-tagged topics until real trend
    scoring lands (analytics back-end track). */
export function TrendingPanel({ items, max }: { items: TrendItem[]; max: number }) {
  if (!items.length) return null;
  return (
    <div className="panel">
      <div className="panel-hd">
        <span className="section-title" style={{ fontSize: 16 }}>
          Trending now
        </span>
        <span className="kicker">this week</span>
      </div>
      {items.map((t, i) => (
        <div className={"rank-row" + (t.hot ? " hot" : "")} key={t.title}>
          <span className="rank-num">{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rank-title">{t.title}</div>
            <div className="rank-bar">
              <span style={{ width: Math.round((t.clips / Math.max(max, 1)) * 100) + "%" }} />
            </div>
          </div>
          <div className="rank-meta">
            <span className="rank-ct">{t.clips} clips</span>
          </div>
        </div>
      ))}
      <Link className="panel-ft" href="/topics">
        See all topics <span>→</span>
      </Link>
    </div>
  );
}

export interface ActivityItem {
  body: string;
  detail: string;
  ago: string;
}

export interface NowIndexing {
  name: string;
  logoUrl?: string | null;
  label: string;
  percent: number;
}

/** "Index activity" — real recent ingestion (latest indexed videos + any in-flight). */
export function ActivityPanel({
  items,
  nowIndexing,
}: {
  items: ActivityItem[];
  nowIndexing?: NowIndexing | null;
}) {
  if (!items.length && !nowIndexing) return null;
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="section-title" style={{ fontSize: 16 }}>
          Index activity
        </span>
        <span className="eyebrow" style={{ fontSize: 11 }}>
          <span className="dot" />
          live
        </span>
      </div>

      {nowIndexing && (
        <div className="now-idx">
          <ChannelAvatar logoUrl={nowIndexing.logoUrl} name={nowIndexing.name} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-2)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ color: "var(--ink-3)" }}>Indexing</span> {nowIndexing.label}
            </div>
            <div className="prog">
              <span style={{ width: nowIndexing.percent + "%" }} />
            </div>
          </div>
          <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>
            {nowIndexing.percent}%
          </span>
        </div>
      )}

      {items.map((a, i) => (
        <div className="feed-row" key={i}>
          <span className="feed-dot" style={{ background: "var(--accent)" }} />
          <div className="feed-body">
            indexed <b>{a.body}</b> — {a.detail}
          </div>
          <span className="feed-ago">{a.ago}</span>
        </div>
      ))}
    </div>
  );
}
