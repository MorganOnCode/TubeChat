import Link from "next/link";
import { createBrowserClient, getVideos, getAllTags, type VideoWithDetails, type Tag } from "@/lib/supabase";

export const revalidate = 300;

async function getLatestVideos(): Promise<VideoWithDetails[]> {
  try {
    const supabase = createBrowserClient();
    return await getVideos(supabase, { limit: 12 });
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

async function getStats(): Promise<{ videos: number; channels: number; transcripts: number }> {
  try {
    const supabase = createBrowserClient();
    const [{ count: videos }, { count: channels }, { count: transcripts }] = await Promise.all([
      supabase.from('videos').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('channels').select('id', { count: 'exact', head: true }),
      supabase.from('transcripts').select('id', { count: 'exact', head: true }).eq('processing_status', 'completed'),
    ]);
    return { videos: videos || 0, channels: channels || 0, transcripts: transcripts || 0 };
  } catch {
    return { videos: 0, channels: 0, transcripts: 0 };
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
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
}

function VideoCard({ video }: { video: VideoWithDetails }) {
  return (
    <Link
      href={`/videos/${video.youtube_id}`}
      className="group block rounded-lg overflow-hidden bg-[var(--background-secondary)] border border-[var(--border)] card-hover"
    >
      <div className="relative aspect-video bg-[var(--background-tertiary)] overflow-hidden">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-[var(--foreground-muted)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
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
        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
          {video.channel && <span>{video.channel.name}</span>}
          {video.channel && video.published_at && <span>·</span>}
          <span>{formatDate(video.published_at)}</span>
          {video.view_count && (
            <>
              <span>·</span>
              <span>{video.view_count.toLocaleString()} views</span>
            </>
          )}
        </div>
        {video.tags && video.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {video.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="tag text-[10px] py-0.5 px-2">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

const FEATURED_CHANNELS = [
  { name: "Danny Jones", slug: "danny-jones", emoji: "🎙️" },
  { name: "Jesse Michels", slug: "jesse-michels", emoji: "🔬" },
  { name: "The Why Files", slug: "the-why-files", emoji: "📁" },
  { name: "UAP Gerb", slug: "uap-gerb", emoji: "🛸" },
  { name: "VETTED", slug: "vetted", emoji: "✅" },
  { name: "Project Unity", slug: "project-unity", emoji: "🌐" },
  { name: "Area52", slug: "area52", emoji: "🏜️" },
  { name: "Bledsoe Said So", slug: "bledsoe-said-so", emoji: "👁️" },
  { name: "The Dreamland Motel", slug: "the-dreamland-motel", emoji: "🏨" },
  { name: "Third Eye Drops", slug: "third-eye-drops-with-michael-phillip", emoji: "🧠" },
];

function HeroSection({ stats }: { stats: { videos: number; channels: number; transcripts: number } }) {
  return (
    <section className="relative h-[520px] sm:h-[560px] overflow-hidden noise">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/hero-banner.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/70 to-[var(--background)]/30" />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)]/50 to-transparent" />

      <div className="relative z-10 flex flex-col items-center justify-end h-full pb-12 px-4 sm:px-6 lg:px-8 text-center">
        <div className="text-4xl mb-4">🛸</div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">
          OpenTube
        </h1>
        <p className="mt-4 text-base sm:text-lg text-white/70 max-w-xl mx-auto">
          Search transcripts across the best UFO, UAP &amp; NHI research channels.
          AI-powered summaries, full-text search, and curated collections.
        </p>

        <div className="mt-8 w-full max-w-lg">
          <Link
            href="/ask"
            className="flex items-center gap-3 w-full h-12 sm:h-14 px-5 rounded-full bg-[var(--background-secondary)]/90 backdrop-blur-sm border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--color-accent)] search-glow transition-all text-sm group"
          >
            <svg className="w-4 h-4 group-hover:text-[var(--color-accent)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span>Ask anything about UFOs, UAPs, NHI research...</span>
          </Link>
          <div className="mt-2 flex justify-center gap-4 text-xs text-white/40">
            <Link href="/search" className="hover:text-[var(--color-accent)] transition-colors">
              or use keyword search →
            </Link>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-6 sm:gap-8 text-xs text-white/50">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span>Auto-updating</span>
          </div>
          <span>·</span>
          <span>{stats.channels} channels</span>
          <span>·</span>
          <span>{stats.videos} videos</span>
          <span>·</span>
          <span>{stats.transcripts} transcripts</span>
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  const [videos, tags, stats] = await Promise.all([getLatestVideos(), getTags(), getStats()]);

  return (
    <div>
      <HeroSection stats={stats} />

      {/* Channels Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-xl font-semibold tracking-tight mb-6">Featured Channels</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {FEATURED_CHANNELS.map((channel) => (
            <Link
              key={channel.slug}
              href={`/videos?channel=${channel.slug}`}
              className="flex items-center gap-2 p-3 rounded-lg bg-[var(--background-secondary)] border border-[var(--border)] hover:border-[var(--color-accent)] transition-colors"
            >
              <span className="text-lg">{channel.emoji}</span>
              <span className="text-sm font-medium truncate">{channel.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest Videos */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold tracking-tight">Latest Videos</h2>
          <Link
            href="/videos"
            className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors"
          >
            View all →
          </Link>
        </div>

        {videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-[var(--foreground-muted)]">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-medium">Ingestion in progress</p>
            <p className="mt-1 text-xs">Videos will appear here once transcripts are processed</p>
          </div>
        )}
      </section>

      {/* Browse by Topic */}
      {tags.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-xl font-semibold tracking-tight mb-6">Browse by Topic</h2>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 30).map((tag) => (
              <Link
                key={tag.id}
                href={`/search?q=${encodeURIComponent(tag.name)}`}
                className="tag"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* About */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <h2 className="text-xl font-semibold tracking-tight mb-4">What is OpenTube?</h2>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          OpenTube is an open-source research tool that indexes YouTube creator content, 
          extracts and cleans transcripts using AI, and makes everything searchable. 
          Think of it as a knowledge base for curated YouTube collections — starting with 
          the UFO, UAP &amp; NHI research community.
        </p>
      </section>
    </div>
  );
}
