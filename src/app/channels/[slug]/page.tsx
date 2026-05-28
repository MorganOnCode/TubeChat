import { notFound } from "next/navigation";
import Link from "next/link";
import { sql, getVideos, type VideoWithDetails, type Tag } from "@/lib/db";
import { Metadata } from "next";

export const revalidate = 300;

interface PageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ page?: string }>;
}

interface ChannelData {
    id: string;
    youtube_id: string;
    name: string;
    slug: string;
    description: string | null;
    thumbnail_url: string | null;
    subscriber_count: number | null;
}

async function getChannelBySlug(slug: string): Promise<ChannelData | null> {
    const rows = await sql<ChannelData[]>`SELECT * FROM channels WHERE slug = ${slug} LIMIT 1`;
    return rows[0] ?? null;
}

async function getChannelVideos(channelId: string, page: number = 1, perPage: number = 24): Promise<{ videos: VideoWithDetails[]; total: number }> {
    try {
        const offset = (page - 1) * perPage;
        const [{ total }] = await sql<{ total: number }[]>`
            SELECT COUNT(*)::int AS total FROM videos
            WHERE channel_id = ${channelId} AND status = 'completed'
        `;
        const videos = await getVideos({ channelId, limit: perPage, offset });
        return { videos, total };
    } catch {
        return { videos: [], total: 0 };
    }
}

async function getChannelTags(channelId: string): Promise<{ name: string; count: number }[]> {
    try {
        return await sql<{ name: string; count: number }[]>`
            SELECT tg.name, COUNT(*)::int AS count
            FROM videos v
            JOIN video_tags vt ON vt.video_id = v.id
            JOIN tags tg ON tg.id = vt.tag_id
            WHERE v.channel_id = ${channelId} AND v.status = 'completed'
            GROUP BY tg.name
            ORDER BY count DESC
            LIMIT 20
        `;
    } catch {
        return [];
    }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const channel = await getChannelBySlug(slug);
    if (!channel) return { title: "Channel Not Found - OpenTube" };

    return {
        title: `${channel.name} - OpenTube`,
        description: channel.description || `Browse transcripts from ${channel.name} on OpenTube.`,
    };
}

function formatDate(dateString?: string): string {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDuration(seconds?: number): string {
    if (!seconds) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
}

function formatSubscribers(count: number | null): string {
    if (!count) return "";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M subscribers`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K subscribers`;
    return `${count} subscribers`;
}

export default async function ChannelPage({ params, searchParams }: PageProps) {
    const { slug } = await params;
    const { page: pageStr } = await searchParams;
    const page = parseInt(pageStr || '1', 10);
    const channel = await getChannelBySlug(slug);

    if (!channel) notFound();

    const [{ videos, total }, topTags] = await Promise.all([
        getChannelVideos(channel.id, page),
        getChannelTags(channel.id),
    ]);

    const totalPages = Math.ceil(total / 24);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Back link */}
            <Link
                href="/channels"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-6"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                All Channels
            </Link>

            {/* Channel header */}
            <div className="flex items-start gap-5 mb-8">
                <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-[var(--background-tertiary)] border-2 border-[var(--border)]">
                    {channel.thumbnail_url ? (
                        <img src={channel.thumbnail_url} alt={channel.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">📺</div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{channel.name}</h1>
                    <div className="mt-1 flex items-center gap-3 text-sm text-[var(--foreground-muted)]">
                        {channel.subscriber_count && <span>{formatSubscribers(channel.subscriber_count)}</span>}
                        <span>{total} videos indexed</span>
                    </div>
                    {channel.description && (
                        <p className="mt-3 text-sm text-[var(--foreground-muted)] leading-relaxed max-w-2xl line-clamp-3">
                            {channel.description}
                        </p>
                    )}
                    <div className="mt-3 flex gap-2">
                        <a
                            href={`https://www.youtube.com/channel/${channel.youtube_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-600/10 border border-red-600/20 text-red-400 hover:bg-red-600/20 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                            YouTube
                        </a>
                        <Link
                            href={`/ask?q=What+are+the+main+topics+${channel.name}+covers`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
                        >
                            🛸 Ask about this channel
                        </Link>
                    </div>
                </div>
            </div>

            {/* Top topics */}
            {topTags.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-[var(--foreground-muted)] mb-3">Top Topics</h2>
                    <div className="flex flex-wrap gap-1.5">
                        {topTags.map((tag) => (
                            <Link
                                key={tag.name}
                                href={`/search?q=${encodeURIComponent(tag.name)}`}
                                className="tag"
                            >
                                {tag.name} <span className="ml-1 text-[var(--foreground-muted)]">({tag.count})</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Videos grid */}
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Videos</h2>
                <span className="text-xs text-[var(--foreground-muted)]">{total} total</span>
            </div>

            {videos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {videos.map((video) => (
                        <Link
                            key={video.id}
                            href={`/videos/${video.youtube_id}`}
                            className="group block rounded-lg overflow-hidden bg-[var(--background-secondary)] border border-[var(--border)] card-hover"
                        >
                            <div className="relative aspect-video bg-[var(--background-tertiary)] overflow-hidden">
                                {video.thumbnail_url ? (
                                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <svg className="w-12 h-12 text-[var(--foreground-muted)]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                    </div>
                                )}
                                {video.duration_seconds && (
                                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-mono font-medium">
                                        {formatDuration(video.duration_seconds)}
                                    </div>
                                )}
                            </div>
                            <div className="p-3.5">
                                <h3 className="font-medium text-sm leading-snug line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
                                    {video.title}
                                </h3>
                                <div className="mt-2 text-xs text-[var(--foreground-muted)]">
                                    {formatDate(video.published_at)}
                                </div>
                                {video.transcript?.summary && (
                                    <p className="mt-2 text-[11px] text-[var(--foreground-muted)] line-clamp-2 leading-relaxed">
                                        {video.transcript.summary.replace(/^• /, '').split('\n')[0]}
                                    </p>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 text-[var(--foreground-muted)]">
                    <p className="text-sm">No videos indexed yet for this channel.</p>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                    {page > 1 && (
                        <Link
                            href={`/channels/${slug}?page=${page - 1}`}
                            className="px-3 py-1.5 text-xs rounded-md bg-[var(--background-secondary)] border border-[var(--border)] hover:border-[var(--color-accent)] transition-colors"
                        >
                            ← Previous
                        </Link>
                    )}
                    <span className="text-xs text-[var(--foreground-muted)]">
                        Page {page} of {totalPages}
                    </span>
                    {page < totalPages && (
                        <Link
                            href={`/channels/${slug}?page=${page + 1}`}
                            className="px-3 py-1.5 text-xs rounded-md bg-[var(--background-secondary)] border border-[var(--border)] hover:border-[var(--color-accent)] transition-colors"
                        >
                            Next →
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
}
