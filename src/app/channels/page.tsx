import Link from "next/link";
import { sql } from "@/lib/db";
import { Metadata } from "next";

export const revalidate = 300;

export const metadata: Metadata = {
    title: "Channels - OpenTube",
    description: "Browse indexed YouTube channels covering UFO, UAP, and NHI research.",
};

interface ChannelWithStats {
    id: string;
    youtube_id: string;
    name: string;
    slug: string;
    description: string | null;
    thumbnail_url: string | null;
    subscriber_count: number | null;
    video_count: number;
}

async function getChannels(): Promise<ChannelWithStats[]> {
    try {
        return await sql<ChannelWithStats[]>`
            SELECT
                c.id, c.youtube_id, c.name, c.slug, c.description,
                c.thumbnail_url, c.subscriber_count,
                COALESCE(vc.cnt, 0)::int AS video_count
            FROM channels c
            LEFT JOIN (
                SELECT channel_id, COUNT(*)::int AS cnt
                FROM videos WHERE status = 'completed'
                GROUP BY channel_id
            ) vc ON vc.channel_id = c.id
            ORDER BY video_count DESC, c.name
        `;
    } catch (error) {
        console.error("Failed to fetch channels:", error);
        return [];
    }
}

function formatSubscribers(count: number | null): string {
    if (!count) return "";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M subscribers`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K subscribers`;
    return `${count} subscribers`;
}

export default async function ChannelsPage() {
    const channels = await getChannels();

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight">Channels</h1>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                    Browse {channels.length} indexed channels. Each channel's transcripts are searchable via the Ask feature.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {channels.map((channel) => (
                    <Link
                        key={channel.id}
                        href={`/channels/${channel.slug}`}
                        className="group flex gap-4 p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] card-hover"
                    >
                        {/* Channel avatar */}
                        <div className="flex-shrink-0 w-16 h-16 rounded-full overflow-hidden bg-[var(--background-tertiary)]">
                            {channel.thumbnail_url ? (
                                <img
                                    src={channel.thumbnail_url}
                                    alt={channel.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl">
                                    📺
                                </div>
                            )}
                        </div>

                        {/* Channel info */}
                        <div className="flex-1 min-w-0">
                            <h2 className="font-medium text-sm group-hover:text-[var(--color-accent)] transition-colors truncate">
                                {channel.name}
                            </h2>
                            {channel.subscriber_count && (
                                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                                    {formatSubscribers(channel.subscriber_count)}
                                </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-[var(--foreground-muted)]">
                                <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    {channel.video_count} videos indexed
                                </span>
                            </div>
                            {channel.description && (
                                <p className="text-[11px] text-[var(--foreground-muted)] mt-2 line-clamp-2 leading-relaxed">
                                    {channel.description}
                                </p>
                            )}
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
