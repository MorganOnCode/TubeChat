import Link from "next/link";
import { hybridSearch } from "@/lib/search-server";
import { type VideoWithDetails } from "@/lib/supabase";
import { Metadata } from "next";

interface PageProps {
    searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const { q } = await searchParams;

    if (q) {
        return {
            title: `Search: ${q} - OpenTube`,
            description: `Search results for "${q}" in creator transcripts.`,
        };
    }

    return {
        title: "Search - OpenTube",
        description: "Search through YouTube creator transcripts.",
    };
}

async function search(query: string): Promise<VideoWithDetails[]> {
    if (!query.trim()) return [];

    try {
        return await hybridSearch(query, 50);
    } catch (error) {
        console.error("Search failed:", error);
        return [];
    }
}

function formatDate(dateString?: string): string {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatDuration(seconds?: number): string {
    if (!seconds) return "";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
}

function highlightText(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

    return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
            ? <mark key={i} className="highlight">{part}</mark>
            : part
    );
}

function getSnippet(text: string, query: string, maxLength: number = 200): string {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text.slice(0, maxLength) + '...';

    const start = Math.max(0, index - 80);
    const end = Math.min(text.length, index + query.length + 80);

    let snippet = text.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
}

function SkeletonResult() {
    return (
        <div className="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)]">
            <div className="flex gap-4">
                <div className="flex-shrink-0 w-32 aspect-video skeleton" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 skeleton" />
                    <div className="h-3 w-1/3 skeleton" />
                    <div className="h-3 w-full skeleton mt-3" />
                    <div className="h-3 w-2/3 skeleton" />
                </div>
            </div>
        </div>
    );
}

export default async function SearchPage({ searchParams }: PageProps) {
    const { q: query = '' } = await searchParams;
    const results = await search(query);

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            {/* Search header */}
            <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight mb-5">Search Transcripts</h1>

                <form action="/search" method="GET">
                    <div className="relative search-glow rounded-lg">
                        <input
                            type="text"
                            name="q"
                            defaultValue={query}
                            placeholder="Search for topics, quotes, or ideas..."
                            className="w-full h-12 pl-4 pr-12 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:border-[var(--color-accent)] transition-all text-sm"
                            autoFocus
                        />
                        <button
                            type="submit"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-light)] transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>

            {/* Results count */}
            {query && (
                <div className="mb-4 text-xs text-[var(--foreground-muted)]">
                    {results.length === 0
                        ? 'No results found'
                        : `${results.length} result${results.length === 1 ? '' : 's'} for "${query}"`
                    }
                </div>
            )}

            {results.length > 0 ? (
                <div className="space-y-3">
                    {results.map((video) => {
                        const transcriptSnippet = video.transcript?.cleaned_text
                            ? getSnippet(video.transcript.cleaned_text, query)
                            : null;

                        return (
                            <Link
                                key={video.id}
                                href={`/videos/${video.youtube_id}`}
                                className="group block p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] card-hover"
                            >
                                <div className="flex gap-4">
                                    {/* Thumbnail */}
                                    <div className="flex-shrink-0 w-32 aspect-video rounded-md overflow-hidden bg-[var(--background-tertiary)]">
                                        {video.thumbnail_url ? (
                                            <img
                                                src={video.thumbnail_url}
                                                alt={video.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <svg className="w-6 h-6 text-[var(--foreground-muted)]" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <h2 className="font-medium text-sm line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
                                            {highlightText(video.title, query)}
                                        </h2>
                                        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                                            {video.channel?.name && <span className="text-[var(--color-accent)]">{video.channel.name}</span>}
                                            {video.channel?.name && <span>·</span>}
                                            <span>{formatDate(video.published_at)}</span>
                                            {video.duration_seconds && (
                                                <>
                                                    <span>·</span>
                                                    <span>{formatDuration(video.duration_seconds)}</span>
                                                </>
                                            )}
                                        </div>

                                        {transcriptSnippet && (
                                            <p className="mt-2 text-xs text-[var(--foreground-muted)] line-clamp-2 leading-relaxed">
                                                {highlightText(transcriptSnippet, query)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            ) : query ? (
                <div className="text-center py-16">
                    <svg className="w-12 h-12 mx-auto mb-3 text-[var(--foreground-muted)] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-sm font-medium text-[var(--foreground-muted)]">No results found</p>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Try different keywords or check your spelling
                    </p>
                </div>
            ) : (
                <div className="text-center py-16">
                    <svg className="w-12 h-12 mx-auto mb-3 text-[var(--foreground-muted)] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-sm font-medium text-[var(--foreground-muted)]">Search the transcript library</p>
                    <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        Find specific topics, quotes, or ideas across curated YouTube collections.
                    </p>
                </div>
            )}
        </div>
    );
}
