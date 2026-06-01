import Link from "next/link";

export interface TopicChip {
  name: string;
  count: number;
}

function topicSlug(name: string): string {
  return encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"));
}

/** Browse-by-topic chips with counts. */
export function TopicRail({ topics, limit }: { topics: TopicChip[]; limit?: number }) {
  const list = limit ? topics.slice(0, limit) : topics;
  const remaining = limit ? Math.max(0, topics.length - limit) : 0;
  return (
    <div className="row gap8 wrapf">
      {list.map((t) => (
        <Link key={t.name} href={`/topics/${topicSlug(t.name)}`} className="topic" style={{ textDecoration: "none" }}>
          {t.name}
          <span className="ct">{t.count}</span>
        </Link>
      ))}
      {remaining > 0 && (
        <Link href="/topics" className="topic more" style={{ textDecoration: "none" }}>
          +{remaining} more
        </Link>
      )}
    </div>
  );
}
