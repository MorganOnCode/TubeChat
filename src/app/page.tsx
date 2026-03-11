import Link from "next/link";
import { createBrowserClient, getVideos, getAllTags, type VideoWithDetails, type Tag } from "@/lib/supabase";

export const revalidate = 300;

async function getLatestVideos(): Promise<VideoWithDetails[]> {
  try {
    const supabase = createBrowserClient();
    return await getVideos(supabase, { limit: 8 });
  } catch (error) {
    console.error("Failed to fetch videos:", error);
    return [];
  }
}

async function getTags(): Promise<Tag[]> {
  try {
    const supabase = createBrowserClient();
    return await getAllTags(supabase);
  } catch (error) {
    console.error("Failed to fetch tags:", error);
    return [];
  }
}

async function getStats(): Promise<{ videos: number; channels: number; chunks: number }> {
  try {
    const supabase = createBrowserClient();
    const [{ count: videos }, { count: channels }, { count: chunks }] = await Promise.all([
      supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('channels').select('id', { count: 'exact', head: true }),
      supabase.from('transcript_chunks').select('id', { count: 'exact', head: true }),
    ]);
    return { videos: videos || 0, channels: channels || 0, chunks: chunks || 0 };
  } catch {
    return { videos: 0, channels: 0, chunks: 0 };
  }
}

async function getChannelsWithThumbnails() {
  try {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from('channels')
      .select('id, name, slug, thumbnail_url, subscriber_count, description')
      .order('subscriber_count', { ascending: false, nullsFirst: false });
    return data || [];
  } catch {
    return [];
  }
}

function formatDate(dateString?: string): string {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

export default async function Home() {
  const [videos, tags, stats, channels] = await Promise.all([
    getLatestVideos(),
    getTags(),
    getStats(),
    getChannelsWithThumbnails(),
  ]);

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-[480px] sm:min-h-[520px] overflow-hidden noise">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-[var(--background)] to-[var(--background)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[var(--color-accent)]/5 rounded-full blur-[120px]" />

        <div className="relative z-10 flex flex-col items-center justify-center min-h-[480px] sm:min-h-[520px] px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] text-[11px] font-medium tracking-wide uppercase mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            {stats.videos} videos indexed · {stats.chunks.toLocaleString()} searchable segments
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            <span className="text-[var(--foreground)]">Open</span><span className="text-[var(--color-accent)]">Tube</span>
          </h1>

          <p className="mt-4 text-base sm:text-lg text-[var(--foreground-muted)] max-w-lg leading-relaxed">
            AI-powered transcript search across the best UFO, UAP &amp; NHI research channels. Ask questions, discover connections.
          </p>

          <div className="mt-8 w-full max-w-lg">
            <Link
              href="/ask"
              className="flex items-center gap-3 w-full h-13 sm:h-14 px-5 rounded-xl bg-[var(--background-secondary)]/80 backdrop-blur-sm border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--color-accent)]/50 search-glow transition-all text-sm group"
            >
              <svg className="w-4 h-4 text-[var(--color-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Ask anything about UFOs, UAPs, NHI research...
              <span className="ml-auto text-[10px] text-[var(--foreground-muted)]/50 hidden sm:block">Powered by RAG</span>
            </Link>
            <div className="mt-3 flex justify-center gap-3 text-[11px] text-[var(--foreground-muted)]/60">
              <Link href="/search" className="hover:text-[var(--color-accent)] transition-colors">Keyword search</Link>
              <span>·</span>
              <Link href="/topics" className="hover:text-[var(--color-accent)] transition-colors">Browse topics</Link>
              <span>·</span>
              <Link href="/channels" className="hover:text-[var(--color-accent)] transition-colors">All channels</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Channels — with real thumbnails */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Indexed Channels</h2>
          <Link href="/channels" className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {channels.map((channel) => (
            <Link
              key={channel.id}
              href={`/channels/${channel.slug}`}
              className="group flex flex-col items-center gap-2.5 p-4 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] hover:border-[var(--color-accent)]/40 transition-all"
            >
              <div className="relative w-14 h-14 rounded-full overflow-hidden bg-[var(--background-tertiary)] ring-2 ring-transparent group-hover:ring-[var(--color-accent)]/30 transition-all">
                {channel.thumbnail_url ? (
                  <img src={channel.thumbnail_url} alt={channel.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg">🛸</div>
                )}
              </div>
              <div className="text-center min-w-0 w-full">
                <h3 className="text-xs font-medium truncate group-hover:text-[var(--color-accent)] transition-colors">
                  {channel.name}
                </h3>
                {channel.subscriber_count && (
                  <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
                    {formatCount(channel.subscriber_count)} subscribers
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest Videos */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Latest Videos</h2>
          <Link href="/videos" className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors">
            View all →
          </Link>
        </div>

        {videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {videos.map((video) => (
              <Link
                key={video.id}
                href={`/videos/${video.youtube_id}`}
                className="group block rounded-xl overflow-hidden bg-[var(--background-secondary)] border border-[var(--border)] hover:border-[var(--color-accent)]/30 transition-all"
              >
                <div className="relative aspect-video bg-[var(--background-tertiary)] overflow-hidden">
                  {video.thumbnail_url ? (
                    <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-[var(--foreground-muted)]/30" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  )}
                  {video.duration_seconds && (
                    <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-medium">
                      {formatDuration(video.duration_seconds)}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-[13px] leading-snug line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
                    {video.title}
                  </h3>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--foreground-muted)]">
                    {video.channel && <span className="text-[var(--color-accent)]/70">{video.channel.name}</span>}
                    {video.published_at && <span>· {formatDate(video.published_at)}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-[var(--foreground-muted)]">
            <p className="text-sm">Ingestion in progress — videos will appear here once processed</p>
          </div>
        )}
      </section>

      {/* Topics cloud */}
      {tags.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold tracking-tight">Popular Topics</h2>
            <Link href="/topics" className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors">
              All topics →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 25).map((tag) => (
              <Link
                key={tag.id}
                href={`/topics/${encodeURIComponent(tag.name.toLowerCase().replace(/\s+/g, '-'))}`}
                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--color-accent)]/30 hover:text-[var(--foreground)] transition-all"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* About */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h2 className="text-lg font-semibold tracking-tight mb-3">What is OpenTube?</h2>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          An open-source research tool that indexes YouTube creator content, extracts transcripts using AI, 
          and makes everything searchable via RAG-powered Q&amp;A. Starting with the UFO/UAP/NHI research community.
        </p>
        <div className="mt-6 flex justify-center gap-6 text-[11px] text-[var(--foreground-muted)]/50">
          <span>{stats.channels} channels</span>
          <span>·</span>
          <span>{stats.videos} videos</span>
          <span>·</span>
          <span>{stats.chunks.toLocaleString()} searchable chunks</span>
        </div>
      </section>
    </div>
  );
}
