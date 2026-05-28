import { notFound } from "next/navigation";
import Link from "next/link";
import { sql, type Tag } from "@/lib/db";
import { Metadata } from "next";

export const revalidate = 300;

interface PageProps {
    params: Promise<{ slug: string }>;
}

interface TopicVideo {
    id: string;
    youtube_id: string;
    title: string;
    published_at: string | null;
    duration_seconds: number | null;
    thumbnail_url: string | null;
    channel_name: string;
    channel_slug: string;
    summary: string | null;
    snippet: string | null;
}

function slugToName(slug: string): string {
    return decodeURIComponent(slug).replace(/-/g, ' ');
}

async function getTopicData(slug: string): Promise<{ tag: Tag; videos: TopicVideo[]; channels: string[] } | null> {
    const name = slugToName(slug);

    // Find the tag (case insensitive)
    const tags = await sql<Tag[]>`SELECT * FROM tags WHERE name ILIKE ${name} LIMIT 1`;
    if (tags.length === 0) return null;
    const tag = tags[0];

    // Get all completed videos carrying this tag, with channel + transcript
    const rows = await sql<{
        id: string; youtube_id: string; title: string;
        published_at: string | null; duration_seconds: number | null; thumbnail_url: string | null;
        channel_name: string | null; channel_slug: string | null;
        summary: string | null; cleaned_text: string | null;
    }[]>`
        SELECT
            v.id, v.youtube_id, v.title, v.published_at, v.duration_seconds, v.thumbnail_url,
            c.name AS channel_name, c.slug AS channel_slug,
            t.summary AS summary, t.cleaned_text AS cleaned_text
        FROM video_tags vt
        JOIN videos v ON v.id = vt.video_id AND v.status = 'completed'
        LEFT JOIN channels c ON c.id = v.channel_id
        LEFT JOIN transcripts t ON t.video_id = v.id
        WHERE vt.tag_id = ${tag.id}
    `;

    const channelSet = new Set<string>();
    const videos: TopicVideo[] = rows.map((v) => {
        const channelName = v.channel_name || 'Unknown';
        const channelSlug = v.channel_slug || '';
        channelSet.add(channelName);

        // Extract a snippet mentioning the topic from the transcript
        let snippet: string | null = null;
        const text = v.cleaned_text || '';
        if (text) {
            const lower = text.toLowerCase();
            const idx = lower.indexOf(name.toLowerCase());
            if (idx !== -1) {
                const start = Math.max(0, idx - 100);
                const end = Math.min(text.length, idx + name.length + 150);
                snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
            }
        }

        return {
            id: v.id,
            youtube_id: v.youtube_id,
            title: v.title,
            published_at: v.published_at,
            duration_seconds: v.duration_seconds,
            thumbnail_url: v.thumbnail_url,
            channel_name: channelName,
            channel_slug: channelSlug,
            summary: v.summary?.split('\n')[0]?.replace(/^• /, '') || null,
            snippet,
        };
    });

    // Sort by date desc
    videos.sort((a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());

    return { tag, videos, channels: Array.from(channelSet) };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const name = slugToName(slug);
    return {
        title: `${name} - OpenTube Topics`,
        description: `Everything about "${name}" across UFO/UAP/NHI research channels.`,
    };
}

function formatDate(d?: string | null): string {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDuration(s?: number | null): string {
    if (!s) return "";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export default async function TopicPage({ params }: PageProps) {
    const { slug } = await params;
    const data = await getTopicData(slug);

    if (!data) notFound();

    const { tag, videos, channels } = data;

    // Group videos by channel for the breakdown
    const byChannel: Record<string, TopicVideo[]> = {};
    for (const v of videos) {
        if (!byChannel[v.channel_name]) byChannel[v.channel_name] = [];
        byChannel[v.channel_name].push(v);
    }

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Back */}
            <Link
                href="/topics"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-6"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                All Topics
            </Link>

            {/* Topic header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{tag.name}</h1>
                <div className="mt-2 flex items-center gap-4 text-sm text-[var(--foreground-muted)]">
                    <span>{videos.length} videos</span>
                    <span>·</span>
                    <span>{channels.length} channel{channels.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                    {channels.map((ch) => (
                        <span key={ch} className="text-xs px-2 py-1 rounded-md bg-[var(--background-tertiary)] border border-[var(--border)] text-[var(--foreground-muted)]">
                            {ch} ({byChannel[ch]?.length || 0})
                        </span>
                    ))}
                </div>

                <Link
                    href={`/ask?q=What+do+channels+say+about+${encodeURIComponent(tag.name)}`}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
                >
                    🛸 Ask about this topic
                </Link>
            </div>

            <div className="border-t border-[var(--border)] my-6" />

            {/* Videos list */}
            <div className="space-y-4">
                {videos.map((video) => (
                    <Link
                        key={video.id}
                        href={`/videos/${video.youtube_id}`}
                        className="group flex gap-4 p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] card-hover"
                    >
                        <div className="flex-shrink-0 w-36 aspect-video rounded-md overflow-hidden bg-[var(--background-tertiary)]">
                            {video.thumbnail_url ? (
                                <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-[var(--foreground-muted)]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
                                {video.title}
                            </h3>
                            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                                <span className="text-[var(--color-accent)]">{video.channel_name}</span>
                                <span>·</span>
                                <span>{formatDate(video.published_at)}</span>
                                {video.duration_seconds && (
                                    <>
                                        <span>·</span>
                                        <span>{formatDuration(video.duration_seconds)}</span>
                                    </>
                                )}
                            </div>
                            {video.snippet && (
                                <p className="mt-2 text-[11px] text-[var(--foreground-muted)] line-clamp-2 leading-relaxed">
                                    {video.snippet}
                                </p>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
