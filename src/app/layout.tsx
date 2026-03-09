import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HoskSaid - Charles Hoskinson Transcript Library",
  description: "Search and explore transcripts from Charles Hoskinson's YouTube videos. A research tool for the Cardano community.",
  keywords: ["Charles Hoskinson", "Cardano", "transcripts", "blockchain", "cryptocurrency", "research"],
  openGraph: {
    title: "HoskSaid - Charles Hoskinson Transcript Library",
    description: "Search and explore transcripts from Charles Hoskinson's YouTube videos.",
    type: "website",
  },
};

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-primary)] flex items-center justify-center transition-transform group-hover:scale-105">
              <span className="text-white font-bold text-xs">H</span>
            </div>
            <span className="font-semibold text-base tracking-tight">
              Hosk<span className="text-[var(--color-accent)]">Said</span>
            </span>
          </Link>

          {/* Navigation */}
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
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-primary)] flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">H</span>
              </div>
              <span className="text-sm font-medium">HoskSaid</span>
            </div>
            <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
              A community research tool for exploring Charles Hoskinson&apos;s YouTube transcripts.
            </p>
          </div>

          {/* Ecosystem */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-3">Cardano Ecosystem</h4>
            <div className="flex flex-col gap-2">
              <a href="https://cardano.org" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                Cardano.org
              </a>
              <a href="https://www.essentialcardano.io" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                Essential Cardano
              </a>
              <a href="https://cardanoscan.io" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                CardanoScan
              </a>
            </div>
          </div>

          {/* Source */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--foreground-muted)] mb-3">Source</h4>
            <div className="flex flex-col gap-2">
              <a href="https://www.youtube.com/@charleshoskinson" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                Charles Hoskinson YouTube
              </a>
              <a href="https://iohk.io" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--foreground-muted)] hover:text-[var(--color-accent)] transition-colors">
                IOG (Input Output)
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--foreground-muted)]">
            Built for the Cardano community · Not affiliated with Charles Hoskinson or IOG
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
