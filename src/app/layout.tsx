import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenTube - YouTube Transcript Search Engine",
  description: "Search and explore transcripts across curated YouTube creator collections. AI-powered summaries, full-text search, and topic tagging.",
  keywords: ["YouTube", "transcripts", "search", "UFO", "UAP", "NHI", "research", "AI summaries"],
  openGraph: {
    title: "OpenTube - YouTube Transcript Search Engine",
    description: "Search and explore transcripts across curated YouTube creator collections.",
    type: "website",
  },
};

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-primary)] flex items-center justify-center transition-transform group-hover:scale-105">
              <span className="text-white text-sm">🛸</span>
            </div>
            <span className="font-semibold text-base tracking-tight">
              Open<span className="text-[var(--color-accent)]">Tube</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              href="/videos"
              className="px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-tertiary)] rounded-md transition-all"
            >
              Videos
            </Link>
            <Link
              href="/search"
              className="px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--background-tertiary)] rounded-md transition-all"
            >
              Search
            </Link>
            <Link
              href="/search"
              className="ml-2 flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--background-tertiary)] border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:border-[var(--color-accent)] hover:text-[var(--foreground)] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline text-xs">Search</span>
              <kbd className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground-muted)]">⌘K</kbd>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🛸</span>
              <span className="text-sm font-medium">OpenTube</span>
            </div>
            <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
              An open-source research tool for searching and exploring YouTube creator transcripts.
              AI-powered summaries and full-text search across curated collections.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-3">Collections</h4>
            <div className="flex flex-col gap-2">
              <Link href="/videos" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                UFO &amp; NHI Research
              </Link>
              <Link href="/search" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                Search Transcripts
              </Link>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-3">Project</h4>
            <div className="flex flex-col gap-2">
              <a href="https://github.com/morganic-jarvis-agent/opentube-creator-hub" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                GitHub
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--foreground-muted)]">
            Open-source transcript search engine · Built with Next.js, Supabase &amp; OpenAI
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased min-h-screen`}>
        <Header />
        <main className="pt-14">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
