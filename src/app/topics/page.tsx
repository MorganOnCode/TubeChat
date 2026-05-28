import Link from "next/link";
import { sql } from "@/lib/db";
import { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
    title: "Topics - OpenTube",
    description: "Browse topics discussed across UFO, UAP, and NHI research channels.",
};

interface TopicWithCount {
    id: string;
    name: string;
    videoCount: number;
    channels: string[];
}

async function getTopics(): Promise<TopicWithCount[]> {
    try {
        return await sql<TopicWithCount[]>`
            SELECT
                tg.id,
                tg.name,
                COUNT(DISTINCT v.id)::int AS "videoCount",
                COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), '{}') AS channels
            FROM tags tg
            JOIN video_tags vt ON vt.tag_id = tg.id
            JOIN videos v ON v.id = vt.video_id AND v.status = 'completed'
            LEFT JOIN channels c ON c.id = v.channel_id
            GROUP BY tg.id, tg.name
            HAVING COUNT(DISTINCT v.id) >= 2
            ORDER BY "videoCount" DESC
        `;
    } catch (error) {
        console.error("Failed to fetch topics:", error);
        return [];
    }
}

export default async function TopicsPage() {
    const topics = await getTopics();

    // Group by cross-source (appears in 3+ channels) vs single-source
    const crossSource = topics.filter(t => t.channels.length >= 3);
    const otherTopics = topics.filter(t => t.channels.length < 3);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight">Topics</h1>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                    Browse {topics.length} topics discussed across channels. Topics appearing in 3+ channels are highlighted as cross-source.
                </p>
            </div>

            {/* Cross-source topics (the interesting ones) */}
            {crossSource.length > 0 && (
                <section className="mb-12">
                    <h2 className="text-lg font-semibold tracking-tight mb-4 flex items-center gap-2">
                        <span className="text-[var(--color-accent)]">🔗</span>
                        Cross-Source Topics
                        <span className="text-xs font-normal text-[var(--foreground-muted)]">— discussed by 3+ channels</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {crossSource.map((topic) => (
                            <Link
                                key={topic.id}
                                href={`/topics/${encodeURIComponent(topic.name.toLowerCase().replace(/\s+/g, '-'))}`}
                                className="group p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--color-accent)]/20 hover:border-[var(--color-accent)] transition-all"
                            >
                                <h3 className="font-medium text-sm group-hover:text-[var(--color-accent)] transition-colors">
                                    {topic.name}
                                </h3>
                                <div className="mt-2 flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
                                    <span>{topic.videoCount} videos</span>
                                    <span>·</span>
                                    <span>{topic.channels.length} channels</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {topic.channels.slice(0, 4).map((ch) => (
                                        <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">
                                            {ch}
                                        </span>
                                    ))}
                                    {topic.channels.length > 4 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--background-tertiary)] text-[var(--foreground-muted)]">
                                            +{topic.channels.length - 4}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* All other topics */}
            <section>
                <h2 className="text-lg font-semibold tracking-tight mb-4">All Topics</h2>
                <div className="flex flex-wrap gap-2">
                    {otherTopics.map((topic) => (
                        <Link
                            key={topic.id}
                            href={`/topics/${encodeURIComponent(topic.name.toLowerCase().replace(/\s+/g, '-'))}`}
                            className="tag group"
                        >
                            {topic.name}
                            <span className="ml-1 text-[var(--foreground-muted)] group-hover:text-[var(--color-accent)]">
                                ({topic.videoCount})
                            </span>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}
